/**
 * Proactive Calendar Briefing Scheduler
 *
 * Runs every minute, checks which users are due for a briefing (6:45am, 11:45am, 5:45pm local),
 * fetches their next 12-18h of calendar events from ALL sub-calendars, formats a grouped
 * summary, and delivers it as a message.
 */

import * as db from './db.js';
import * as gcal from './google-calendar.js';
import * as mscal from './microsoft-calendar.js';

// Briefing schedule: [hour, minute, label, lookAheadHours]
const BRIEFING_TIMES = [
  { hour: 6,  minute: 45, label: 'Morning',   lookAhead: 14 },
  { hour: 11, minute: 45, label: 'Midday',    lookAhead: 10 },
  { hour: 17, minute: 45, label: 'Evening',   lookAhead: 16 },
] as const;

let running = false;

/**
 * Check all briefing windows and send summaries to eligible users.
 */
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const bt of BRIEFING_TIMES) {
      const users = await db.getUsersDueForBriefing(bt.hour, bt.minute);
      if (users.length === 0) continue;

      console.log(`[Briefing] ${bt.label} briefing: ${users.length} user(s) due`);
      for (const user of users) {
        try {
          await sendBriefing(user, bt);
        } catch (err) {
          console.error(`[Briefing] Failed for user ${user.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[Briefing] Tick error:', err);
  } finally {
    running = false;
  }
}

interface CalendarEvents {
  calendarName: string;
  events: gcal.CalendarEvent[];
}

async function sendBriefing(
  user: db.BriefingUser,
  bt: { label: string; lookAhead: number },
) {
  // Compute time window
  const now = new Date();
  const startISO = now.toISOString();
  const endDate = new Date(now.getTime() + bt.lookAhead * 60 * 60 * 1000);
  const endISO = endDate.toISOString();

  const calendarGroups: CalendarEvents[] = [];
  let totalEvents = 0;

  // ── Google Calendar ──
  try {
    const googleCalendars = await gcal.listCalendars(user.id);
    const associations = await db.getCalendarAssociations(user.id);
    const linkedIds = new Set(associations.map((a) => a.calendar_id));
    const relevantGoogle = googleCalendars.filter(
      (c) => c.accessRole === 'owner' || linkedIds.has(c.id)
    );

    for (const cal of relevantGoogle) {
      try {
        const events = await gcal.getEvents({
          userId: user.id,
          calendarId: cal.id,
          startDate: startISO,
          endDate: endISO,
          maxResults: 30,
        });
        if (events.length > 0) {
          calendarGroups.push({ calendarName: cal.name, events });
          totalEvents += events.length;
        }
      } catch (err) {
        console.error(`[Briefing] Failed to fetch Google calendar ${cal.id} for user ${user.id}:`, err);
      }
    }
  } catch {
    // Google not connected or token expired — skip silently
  }

  // ── Microsoft Calendar ──
  try {
    const msCalendars = await mscal.listCalendars(user.id);
    for (const cal of msCalendars) {
      try {
        const events = await mscal.getEvents({
          userId: user.id,
          calendarId: cal.id,
          startDate: startISO,
          endDate: endISO,
          maxResults: 30,
        });
        if (events.length > 0) {
          calendarGroups.push({ calendarName: `${cal.name} (Teams)`, events });
          totalEvents += events.length;
        }
      } catch (err) {
        console.error(`[Briefing] Failed to fetch Microsoft calendar ${cal.id} for user ${user.id}:`, err);
      }
    }
  } catch {
    // Microsoft not connected or token expired — skip silently
  }

  // Skip briefing entirely if no events — saves tokens and avoids noise
  if (totalEvents === 0) {
    console.log(`[Briefing] No events for ${user.display_name ?? user.id.slice(0, 8)} — skipping ${bt.label} briefing`);
    return;
  }

  // Format and deliver
  const content = formatBriefing(user, bt.label, calendarGroups, totalEvents, user.timezone);
  await db.createMessage(user.notebook_id, 'assistant', content);
  await db.updateLastBriefing(user.id);

  console.log(`[Briefing] Sent ${bt.label} briefing to ${user.display_name ?? user.email ?? user.id} (${totalEvents} events across ${calendarGroups.length} calendar(s))`);
}

function formatBriefing(
  user: db.BriefingUser,
  label: string,
  groups: CalendarEvents[],
  totalEvents: number,
  timezone: string,
): string {
  const name = user.display_name ?? 'there';
  const greeting = label === 'Morning' ? 'Good morning' : label === 'Midday' ? 'Hey' : 'Good evening';

  const lines: string[] = [];
  lines.push(`**${greeting}, ${name}!** Here's your ${label.toLowerCase()} briefing:\n`);

  if (totalEvents === 0) {
    lines.push("You're all clear — no upcoming events in the next few hours.");
    return lines.join('\n');
  }

  const singleCalendar = groups.length === 1;

  for (const group of groups) {
    // Show calendar heading when there are multiple calendars
    if (!singleCalendar) {
      lines.push(`### ${group.calendarName}`);
    }

    for (const ev of group.events) {
      const time = formatEventTime(ev, timezone);
      const location = ev.location ? ` 📍 ${ev.location}` : '';
      const title = ev.link ? `[${ev.title}](${ev.link})` : ev.title;
      lines.push(`- **${time}** — ${title}${location}`);
    }

    if (!singleCalendar) lines.push(''); // blank line between groups
  }

  lines.push(`${totalEvents} event${totalEvents > 1 ? 's' : ''} coming up.`);

  return lines.join('\n');
}

function formatEventTime(ev: gcal.CalendarEvent, timezone: string): string {
  if (ev.allDay) return 'All day';

  try {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const fmt = (d: Date) =>
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
    return `${fmt(start)}–${fmt(end)}`;
  } catch {
    return ev.start;
  }
}

/**
 * Start the briefing scheduler. Runs every 60 seconds.
 */
export function startBriefingScheduler() {
  console.log('[Briefing] Scheduler started — checking every 60s');
  // Initial check after 10s delay (let the server fully start)
  setTimeout(() => tick(), 10_000);
  // Then every 60s
  setInterval(() => tick(), 60_000);
}

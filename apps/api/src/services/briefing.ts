/**
 * Proactive Calendar Briefing Scheduler
 *
 * Runs every minute, checks which users are due for a briefing (6:45am, 11:45am, 5:45pm local),
 * fetches their next 12-18h of calendar events, formats a summary, and delivers it as a message.
 */

import * as db from './db.js';
import * as gcal from './google-calendar.js';

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

async function sendBriefing(
  user: db.BriefingUser,
  bt: { label: string; lookAhead: number },
) {
  // Get all calendars linked to this user
  const associations = await db.getCalendarAssociations(user.id);
  if (associations.length === 0) return;

  // Compute time window in user's timezone
  const now = new Date();
  const startISO = now.toISOString();
  const endDate = new Date(now.getTime() + bt.lookAhead * 60 * 60 * 1000);
  const endISO = endDate.toISOString();

  // Fetch events from all linked calendars
  const allEvents: Array<gcal.CalendarEvent & { calendarName: string }> = [];
  for (const assoc of associations) {
    try {
      const events = await gcal.getEvents({
        userId: user.id,
        calendarId: assoc.calendar_id,
        startDate: startISO,
        endDate: endISO,
        maxResults: 30,
      });
      for (const ev of events) {
        allEvents.push({ ...ev, calendarName: assoc.calendar_name });
      }
    } catch (err) {
      console.error(`[Briefing] Failed to fetch calendar ${assoc.calendar_id} for user ${user.id}:`, err);
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Format the briefing message
  const content = formatBriefing(user, bt.label, allEvents, user.timezone);

  // Deliver as an assistant message in the user's notebook
  await db.createMessage(user.notebook_id, 'assistant', content);

  // Mark briefing as sent
  await db.updateLastBriefing(user.id);

  console.log(`[Briefing] Sent ${bt.label} briefing to ${user.display_name ?? user.email ?? user.id} (${allEvents.length} events)`);
}

function formatBriefing(
  user: db.BriefingUser,
  label: string,
  events: Array<gcal.CalendarEvent & { calendarName: string }>,
  timezone: string,
): string {
  const name = user.display_name ?? 'there';
  const greeting = label === 'Morning' ? 'Good morning' : label === 'Midday' ? 'Hey' : 'Good evening';

  const lines: string[] = [];
  lines.push(`**${greeting}, ${name}!** Here's your ${label.toLowerCase()} briefing:\n`);

  if (events.length === 0) {
    lines.push("You're all clear — no upcoming events in the next few hours. 🎉");
  } else {
    for (const ev of events) {
      const time = formatEventTime(ev, timezone);
      const calLabel = events.length > 1 ? ` · *${ev.calendarName}*` : '';
      const location = ev.location ? ` 📍 ${ev.location}` : '';
      const title = ev.link ? `[${ev.title}](${ev.link})` : ev.title;
      lines.push(`- **${time}** — ${title}${calLabel}${location}`);
    }

    lines.push(`\n${events.length} event${events.length > 1 ? 's' : ''} coming up.`);
  }

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

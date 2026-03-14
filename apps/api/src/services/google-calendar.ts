/**
 * Google Calendar service — authenticated calendar operations for Minai tool use.
 * Tokens are fetched from DB per-user and auto-refreshed via googleapis.
 */

import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import * as db from './db.js';

const NOT_CONNECTED = 'Google Calendar is not connected. Ask the user to go to Settings and connect their Google account.';

async function getClient(userId: string) {
  const tokens = await db.getGoogleTokens(userId);
  if (!tokens) throw new Error(NOT_CONNECTED);

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  auth.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.token_expiry ? new Date(tokens.token_expiry).getTime() : undefined,
  });

  // Persist refreshed tokens back to DB automatically
  auth.on('tokens', async (newTokens) => {
    await db.saveGoogleTokens(
      userId,
      newTokens.access_token ?? tokens.access_token,
      newTokens.refresh_token ?? tokens.refresh_token,
      newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
      tokens.scopes,
    );
  });

  return google.calendar({ version: 'v3', auth });
}

// ─── List all calendars ───────────────────────────────────────────────────────

export interface CalendarEntry {
  id: string;
  name: string;
  description?: string;
  timeZone?: string;
  accessRole: string;
  isShared: boolean;
  notebookId?: string;
  notebookName?: string;
}

export async function listCalendars(userId: string): Promise<CalendarEntry[]> {
  const cal = await getClient(userId);
  const { data } = await cal.calendarList.list({ maxResults: 100 });
  const items = data.items ?? [];

  // Fetch notebook associations
  const associations = await db.getCalendarAssociations(userId);
  const assocMap = new Map(associations.map((a) => [a.calendar_id, a]));

  return items.map((item) => {
    const assoc = assocMap.get(item.id!);
    return {
      id: item.id!,
      name: item.summary ?? item.id!,
      description: item.description ?? undefined,
      timeZone: item.timeZone ?? undefined,
      accessRole: item.accessRole ?? 'reader',
      isShared: item.accessRole !== 'owner',
      notebookId: assoc?.notebook_id,
      notebookName: assoc?.notebook_name,
    };
  });
}

// ─── List events ──────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string;
  location?: string;
  attendees?: string[];
  link?: string;
  organizer?: string;
}

export async function getEvents(args: {
  userId: string;
  calendarId: string;
  startDate: string;  // ISO date or datetime
  endDate: string;
  maxResults?: number;
  query?: string;
}): Promise<CalendarEvent[]> {
  const cal = await getClient(args.userId);

  const timeMin = new Date(args.startDate);
  const timeMax = new Date(args.endDate);
  // If just dates (no time), span the full day
  if (!args.startDate.includes('T')) timeMin.setHours(0, 0, 0, 0);
  if (!args.endDate.includes('T')) timeMax.setHours(23, 59, 59, 999);

  const { data } = await cal.events.list({
    calendarId: args.calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: args.maxResults ?? 20,
    singleEvents: true,
    orderBy: 'startTime',
    q: args.query,
  });

  return (data.items ?? []).map((e) => ({
    id: e.id!,
    calendarId: args.calendarId,
    title: e.summary ?? '(No title)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    allDay: !e.start?.dateTime,
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    attendees: e.attendees?.map((a) => a.email ?? '').filter(Boolean),
    link: e.htmlLink ?? undefined,
    organizer: e.organizer?.email ?? undefined,
  }));
}

// ─── Create event ─────────────────────────────────────────────────────────────

export async function createEvent(args: {
  userId: string;
  calendarId: string;
  title: string;
  start: string;      // ISO datetime
  end: string;        // ISO datetime
  timezone: string;   // IANA, e.g. "Africa/Nairobi"
  description?: string;
  location?: string;
  attendees?: string[];
  sendNotifications?: boolean;
}): Promise<{ id: string; link: string; summary: string }> {
  const cal = await getClient(args.userId);

  const event: calendar_v3.Schema$Event = {
    summary: args.title,
    description: args.description,
    location: args.location,
    start: { dateTime: args.start, timeZone: args.timezone },
    end: { dateTime: args.end, timeZone: args.timezone },
    attendees: args.attendees?.map((email) => ({ email })),
  };

  const { data } = await cal.events.insert({
    calendarId: args.calendarId,
    requestBody: event,
    sendNotifications: args.sendNotifications ?? true,
  });

  return {
    id: data.id!,
    link: data.htmlLink!,
    summary: formatEventSummary(data, args.timezone),
  };
}

// ─── Update event ─────────────────────────────────────────────────────────────

export async function updateEvent(args: {
  userId: string;
  calendarId: string;
  eventId: string;
  title?: string;
  start?: string;
  end?: string;
  timezone?: string;
  description?: string;
  location?: string;
  attendees?: string[];
  sendNotifications?: boolean;
}): Promise<{ id: string; link: string; summary: string }> {
  const cal = await getClient(args.userId);

  // Fetch existing to patch
  const { data: existing } = await cal.events.get({
    calendarId: args.calendarId,
    eventId: args.eventId,
  });

  const tz = args.timezone ?? existing.start?.timeZone ?? 'UTC';
  const patch: calendar_v3.Schema$Event = {
    summary: args.title ?? existing.summary,
    description: args.description ?? existing.description,
    location: args.location ?? existing.location,
    start: args.start
      ? { dateTime: args.start, timeZone: tz }
      : existing.start,
    end: args.end
      ? { dateTime: args.end, timeZone: tz }
      : existing.end,
    attendees: args.attendees
      ? args.attendees.map((email) => ({ email }))
      : existing.attendees,
  };

  const { data } = await cal.events.patch({
    calendarId: args.calendarId,
    eventId: args.eventId,
    requestBody: patch,
    sendNotifications: args.sendNotifications ?? true,
  });

  return {
    id: data.id!,
    link: data.htmlLink!,
    summary: formatEventSummary(data, tz),
  };
}

// ─── Delete event ─────────────────────────────────────────────────────────────

export async function deleteEvent(args: {
  userId: string;
  calendarId: string;
  eventId: string;
  sendNotifications?: boolean;
}): Promise<void> {
  const cal = await getClient(args.userId);
  await cal.events.delete({
    calendarId: args.calendarId,
    eventId: args.eventId,
    sendNotifications: args.sendNotifications ?? true,
  });
}

// ─── Find free slots ──────────────────────────────────────────────────────────

export interface FreeSlot {
  start: string;
  end: string;
}

export async function findFreeSlots(args: {
  userId: string;
  calendarIds: string[];
  date: string;           // ISO date, e.g. "2026-03-20"
  durationMinutes: number;
  timezone: string;
  workdayStart?: string;  // e.g. "09:00"
  workdayEnd?: string;    // e.g. "17:00"
}): Promise<FreeSlot[]> {
  const cal = await getClient(args.userId);

  const workStart = args.workdayStart ?? '09:00';
  const workEnd = args.workdayEnd ?? '17:00';

  const [sh, sm] = workStart.split(':').map(Number);
  const [eh, em] = workEnd.split(':').map(Number);

  // Build window in the requested timezone via UTC offset trick
  // We use the freebusy API which works in UTC, so compute boundaries
  const dayStart = new Date(`${args.date}T${workStart}:00`);
  const dayEnd = new Date(`${args.date}T${workEnd}:00`);

  const { data } = await cal.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      timeZone: args.timezone,
      items: args.calendarIds.map((id) => ({ id })),
    },
  });

  // Collect all busy intervals
  const busyIntervals: { start: Date; end: Date }[] = [];
  for (const calId of args.calendarIds) {
    const busy = data.calendars?.[calId]?.busy ?? [];
    for (const b of busy) {
      if (b.start && b.end) {
        busyIntervals.push({ start: new Date(b.start), end: new Date(b.end) });
      }
    }
  }

  // Sort and merge overlapping busy blocks
  busyIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: { start: Date; end: Date }[] = [];
  for (const interval of busyIntervals) {
    if (merged.length && interval.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = new Date(
        Math.max(merged[merged.length - 1].end.getTime(), interval.end.getTime())
      );
    } else {
      merged.push({ ...interval });
    }
  }

  // Walk the workday and collect free windows >= durationMinutes
  const durationMs = args.durationMinutes * 60_000;
  const slots: FreeSlot[] = [];
  let cursor = dayStart;

  for (const busy of merged) {
    if (cursor < busy.start) {
      const gap = busy.start.getTime() - cursor.getTime();
      if (gap >= durationMs) {
        slots.push({ start: cursor.toISOString(), end: busy.start.toISOString() });
      }
    }
    if (busy.end > cursor) cursor = busy.end;
  }

  // Trailing free window
  if (cursor < dayEnd) {
    const gap = dayEnd.getTime() - cursor.getTime();
    if (gap >= durationMs) {
      slots.push({ start: cursor.toISOString(), end: dayEnd.toISOString() });
    }
  }

  return slots;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEventSummary(event: calendar_v3.Schema$Event, tz: string): string {
  const start = event.start?.dateTime ?? event.start?.date ?? '';
  const end = event.end?.dateTime ?? event.end?.date ?? '';
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch { return iso; }
  };
  const lines = [
    `**${event.summary ?? '(No title)'}**`,
    `Start: ${fmt(start)}`,
    `End:   ${fmt(end)}`,
  ];
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.attendees?.length) {
    lines.push(`Attendees: ${event.attendees.map((a) => a.email).join(', ')}`);
  }
  if (event.htmlLink) lines.push(`Link: ${event.htmlLink}`);
  return lines.join('\n');
}

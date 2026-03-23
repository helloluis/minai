/**
 * Microsoft Calendar service — Teams/Outlook calendar operations via Microsoft Graph API.
 * Tokens are fetched from DB per-user and auto-refreshed.
 */

import * as db from './db.js';
import type { CalendarEntry, CalendarEvent, FreeSlot } from './google-calendar.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const NOT_CONNECTED = 'Microsoft Calendar is not connected. Ask the user to go to Settings and connect their Microsoft account.';

async function getAccessToken(userId: string): Promise<string> {
  const tokens = await db.getMicrosoftTokens(userId);
  if (!tokens) throw new Error(NOT_CONNECTED);

  // Check if token is expired (with 5 min buffer)
  const expiry = tokens.token_expiry ? new Date(tokens.token_expiry).getTime() : 0;
  if (Date.now() < expiry - 5 * 60_000) {
    return tokens.access_token;
  }

  // Refresh
  if (!tokens.refresh_token) throw new Error('Microsoft token expired and no refresh token available. Please reconnect in Settings.');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
      scope: 'openid profile email offline_access Calendars.ReadWrite',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Microsoft] Token refresh failed:', err);
    throw new Error('Microsoft token refresh failed. Please reconnect in Settings.');
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const newExpiry = new Date(Date.now() + data.expires_in * 1000);
  await db.saveMicrosoftTokens(
    userId,
    data.access_token,
    data.refresh_token ?? tokens.refresh_token,
    newExpiry,
    tokens.microsoft_id,
    tokens.email,
    tokens.display_name,
  );

  return data.access_token;
}

async function graphFetch(userId: string, path: string, options?: RequestInit) {
  const token = await getAccessToken(userId);
  const res = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft Graph error (${res.status}): ${err.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── List calendars ──────────────────────────────────────────────────────────

export async function listCalendars(userId: string): Promise<CalendarEntry[]> {
  const data = await graphFetch(userId, '/me/calendars') as { value: Array<{
    id: string; name: string; canEdit: boolean; isDefaultCalendar: boolean;
    owner?: { name: string; address: string };
  }> };

  return data.value.map((cal) => ({
    id: cal.id,
    name: cal.name,
    accessRole: cal.canEdit ? 'writer' : 'reader',
    isShared: !cal.isDefaultCalendar,
    source: 'microsoft' as const,
  }));
}

// ─── Get events ──────────────────────────────────────────────────────────────

export async function getEvents(args: {
  userId: string;
  calendarId: string;
  startDate: string;
  endDate: string;
  maxResults?: number;
  query?: string;
}): Promise<CalendarEvent[]> {
  const startDt = args.startDate.includes('T') ? args.startDate : `${args.startDate}T00:00:00`;
  const endDt = args.endDate.includes('T') ? args.endDate : `${args.endDate}T23:59:59`;

  const params = new URLSearchParams({
    startDateTime: startDt,
    endDateTime: endDt,
    $top: String(args.maxResults ?? 20),
    $orderby: 'start/dateTime',
  });
  if (args.query) params.set('$filter', `contains(subject,'${args.query}')`);

  const data = await graphFetch(userId(args), `/me/calendars/${args.calendarId}/calendarView?${params}`) as {
    value: MsEvent[];
  };

  return data.value.map((e) => ({
    id: e.id,
    calendarId: args.calendarId,
    title: e.subject ?? '(No title)',
    start: e.start?.dateTime ? e.start.dateTime + 'Z' : '',
    end: e.end?.dateTime ? e.end.dateTime + 'Z' : '',
    allDay: e.isAllDay ?? false,
    description: e.bodyPreview ?? undefined,
    location: e.location?.displayName ?? undefined,
    attendees: e.attendees?.map((a) => a.emailAddress?.address ?? '').filter(Boolean),
    link: e.webLink ?? undefined,
    organizer: e.organizer?.emailAddress?.address ?? undefined,
  }));
}

// ─── Create event ────────────────────────────────────────────────────────────

export async function createEvent(args: {
  userId: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  timezone: string;
  description?: string;
  location?: string;
  attendees?: string[];
  sendNotifications?: boolean;
}): Promise<{ id: string; link: string; summary: string }> {
  const body: Record<string, unknown> = {
    subject: args.title,
    start: { dateTime: args.start, timeZone: args.timezone },
    end: { dateTime: args.end, timeZone: args.timezone },
  };
  if (args.description) body.body = { contentType: 'text', content: args.description };
  if (args.location) body.location = { displayName: args.location };
  if (args.attendees?.length) {
    body.attendees = args.attendees.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    }));
  }

  const data = await graphFetch(args.userId, `/me/calendars/${args.calendarId}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as MsEvent;

  return {
    id: data.id,
    link: data.webLink ?? '',
    summary: formatEventSummary(data, args.timezone),
  };
}

// ─── Update event ────────────────────────────────────────────────────────────

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
  const tz = args.timezone ?? 'UTC';
  const patch: Record<string, unknown> = {};
  if (args.title) patch.subject = args.title;
  if (args.start) patch.start = { dateTime: args.start, timeZone: tz };
  if (args.end) patch.end = { dateTime: args.end, timeZone: tz };
  if (args.description) patch.body = { contentType: 'text', content: args.description };
  if (args.location) patch.location = { displayName: args.location };
  if (args.attendees) {
    patch.attendees = args.attendees.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    }));
  }

  const data = await graphFetch(args.userId, `/me/events/${args.eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }) as MsEvent;

  return {
    id: data.id,
    link: data.webLink ?? '',
    summary: formatEventSummary(data, tz),
  };
}

// ─── Delete event ────────────────────────────────────────────────────────────

export async function deleteEvent(args: {
  userId: string;
  calendarId: string;
  eventId: string;
  sendNotifications?: boolean;
}): Promise<void> {
  await graphFetch(args.userId, `/me/events/${args.eventId}`, { method: 'DELETE' });
}

// ─── Find free slots ─────────────────────────────────────────────────────────

export async function findFreeSlots(args: {
  userId: string;
  calendarIds: string[];
  date: string;
  durationMinutes: number;
  timezone: string;
  workdayStart?: string;
  workdayEnd?: string;
}): Promise<FreeSlot[]> {
  const workStart = args.workdayStart ?? '09:00';
  const workEnd = args.workdayEnd ?? '17:00';

  // Get all events for the day across requested calendars
  const allBusy: { start: Date; end: Date }[] = [];

  for (const calId of args.calendarIds) {
    try {
      const events = await getEvents({
        userId: args.userId,
        calendarId: calId,
        startDate: `${args.date}T${workStart}:00`,
        endDate: `${args.date}T${workEnd}:00`,
        maxResults: 50,
      });
      for (const e of events) {
        if (e.start && e.end) {
          allBusy.push({ start: new Date(e.start), end: new Date(e.end) });
        }
      }
    } catch (err) {
      console.warn(`[Microsoft] Failed to get events for calendar ${calId}:`, err);
    }
  }

  // Sort and merge
  allBusy.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: { start: Date; end: Date }[] = [];
  for (const interval of allBusy) {
    if (merged.length && interval.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = new Date(
        Math.max(merged[merged.length - 1].end.getTime(), interval.end.getTime())
      );
    } else {
      merged.push({ ...interval });
    }
  }

  const dayStart = new Date(`${args.date}T${workStart}:00`);
  const dayEnd = new Date(`${args.date}T${workEnd}:00`);
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

  if (cursor < dayEnd) {
    const gap = dayEnd.getTime() - cursor.getTime();
    if (gap >= durationMs) {
      slots.push({ start: cursor.toISOString(), end: dayEnd.toISOString() });
    }
  }

  return slots;
}

// ─── Types & Helpers ─────────────────────────────────────────────────────────

interface MsEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  isAllDay?: boolean;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  location?: { displayName?: string };
  attendees?: Array<{ emailAddress?: { address: string; name?: string }; type?: string }>;
  organizer?: { emailAddress?: { address: string; name?: string } };
  webLink?: string;
}

function userId(args: { userId: string }) { return args.userId; }

function formatEventSummary(event: MsEvent, tz: string): string {
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      });
    } catch { return iso; }
  };
  const lines = [
    `**${event.subject ?? '(No title)'}**`,
    `Start: ${fmt(event.start?.dateTime ? event.start.dateTime + 'Z' : '')}`,
    `End:   ${fmt(event.end?.dateTime ? event.end.dateTime + 'Z' : '')}`,
  ];
  if (event.location?.displayName) lines.push(`Location: ${event.location.displayName}`);
  if (event.attendees?.length) {
    lines.push(`Attendees: ${event.attendees.map((a) => a.emailAddress?.address).filter(Boolean).join(', ')}`);
  }
  if (event.webLink) lines.push(`Link: ${event.webLink}`);
  return lines.join('\n');
}

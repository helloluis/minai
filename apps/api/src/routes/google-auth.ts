import type { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import * as db from '../services/db.js';

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
];

const ALLOWED_ORIGINS = (process.env.API_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

function getOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
  );
}

/** Build the callback URL from the request's own origin */
function getCallbackUri(request: { headers: { host?: string }; protocol?: string }): string {
  const host = request.headers.host ?? 'localhost:3000';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/auth/google/callback`;
}

export async function googleAuthRoutes(fastify: FastifyInstance) {
  // GET /api/auth/google — redirect to Google consent screen
  fastify.get('/api/auth/google', async (request, reply) => {
    const callbackUri = getCallbackUri(request);
    const oauth2Client = getOAuth2Client(callbackUri);

    // Encode source in state (no session token — session is read from cookie on callback)
    const { source } = request.query as { source?: string };
    const state = Buffer.from(JSON.stringify({ source: source ?? 'login' })).toString('base64url');

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Always show consent to get refresh_token
      state,
    });

    reply.redirect(url);
  });

  // GET /api/auth/google/callback — exchange code, save tokens, redirect to app
  fastify.get('/api/auth/google/callback', async (request, reply) => {
    const { code, state, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error || !code) {
      return reply.redirect('/?auth_error=' + encodeURIComponent(error ?? 'no_code'));
    }

    try {
      const callbackUri = getCallbackUri(request);
      const oauth2Client = getOAuth2Client(callbackUri);
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Fetch Google profile
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();

      const googleId = profile.id!;
      const email = profile.email ?? '';
      const firstName = (profile.given_name ?? profile.name ?? email).split(' ')[0];
      const displayName = firstName;
      const avatarUrl = profile.picture ?? '';

      // Decode state (source only — session comes from cookie)
      let stateData: { source?: string } = {};
      if (state) {
        try {
          stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
        } catch { /* ignore malformed state */ }
      }

      // Get existing session's user from cookie (not from state param)
      let existingUserId: string | null = null;
      const sessionCookie = request.cookies?.session;
      if (sessionCookie) {
        const existing = await db.getUserBySession(sessionCookie);
        existingUserId = existing?.id ?? null;
      }

      // Find or create user
      let user = await db.findUserByGoogleId(googleId);

      if (!user) {
        if (existingUserId) {
          // Link Google account to existing anonymous session
          user = await db.linkGoogleAccount(existingUserId, googleId, email, displayName, avatarUrl);
        } else {
          // New user via SSO — create fresh account and link
          const { v4: uuid } = await import('uuid');
          const newUser = await db.createUser(uuid());
          await db.createBalance(newUser.id);
          user = await db.linkGoogleAccount(newUser.id, googleId, email, displayName, avatarUrl);
        }
        // Seed name memory so the bot skips the ask-for-name greeting flow
        await db.upsertUserMemory(user.id, 'name', displayName);
      }
      // If user already existed (returning Google user), we have them — fall through to set cookie.
      // If existingUserId points to a different anonymous session, we log in as the Google user.

      // Always set session cookie for the resolved user
      reply.setCookie('session', user.session_token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 14, // 14 days
      });

      // Save OAuth tokens
      await db.saveGoogleTokens(
        user.id,
        tokens.access_token!,
        tokens.refresh_token ?? null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        SCOPES.join(' ')
      );

      const redirectTo = stateData.source === 'settings' ? '/settings?google_connected=1' : '/';
      reply.redirect(redirectTo);
    } catch (err) {
      fastify.log.error(err, 'Google OAuth callback error');
      reply.redirect('/settings?auth_error=callback_failed');
    }
  });

  // GET /api/auth/google/status — check if current user has Google connected
  fastify.get('/api/auth/google/status', async (request) => {
    const tokens = await db.getGoogleTokens(request.user.id);
    const user = await db.getUserBySession(request.cookies?.session ?? '');
    return {
      connected: !!tokens,
      email: user?.email ?? null,
      display_name: user?.display_name ?? null,
      avatar_url: user?.avatar_url ?? null,
    };
  });

  // POST /api/auth/google/disconnect — remove Google tokens
  fastify.post('/api/auth/google/disconnect', async (request) => {
    await db.saveGoogleTokens(request.user.id, '__disconnected__', null, null, null);
    // Clear by deleting instead
    await db.pool.query(
      'DELETE FROM google_tokens WHERE user_id = $1',
      [request.user.id]
    );
    return { disconnected: true };
  });
}

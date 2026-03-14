import type { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import * as db from '../services/db.js';

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
  );
}

export async function googleAuthRoutes(fastify: FastifyInstance) {
  // GET /api/auth/google — redirect to Google consent screen
  fastify.get('/api/auth/google', async (request, reply) => {
    const oauth2Client = getOAuth2Client();

    // Encode current session in state so we can link accounts after callback
    const sessionToken = request.cookies?.session ?? '';
    const state = Buffer.from(JSON.stringify({ session: sessionToken })).toString('base64url');

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
      const oauth2Client = getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Fetch Google profile
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();

      const googleId = profile.id!;
      const email = profile.email ?? '';
      const displayName = profile.name ?? email;
      const avatarUrl = profile.picture ?? '';

      // Decode state to get existing session
      let existingUserId: string | null = null;
      if (state) {
        try {
          const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
          if (decoded.session) {
            const existing = await db.getUserBySession(decoded.session);
            existingUserId = existing?.id ?? null;
          }
        } catch { /* ignore malformed state */ }
      }

      // Find or link user
      let user = await db.findUserByGoogleId(googleId);

      if (!user) {
        if (existingUserId) {
          // Link Google account to existing anonymous session
          user = await db.linkGoogleAccount(existingUserId, googleId, email, displayName, avatarUrl);
        } else {
          // New user: create a fresh one then link
          const { v4: uuid } = await import('uuid');
          const newUser = await db.createUser(uuid());
          await db.createBalance(newUser.id);
          user = await db.linkGoogleAccount(newUser.id, googleId, email, displayName, avatarUrl);

          // Set session cookie for new user
          reply.setCookie('session', newUser.session_token, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 365,
          });
        }
      } else if (existingUserId && existingUserId !== user.id) {
        // Google account belongs to a different user — just set their session
        reply.setCookie('session', user.session_token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365,
        });
      }

      // Save OAuth tokens
      await db.saveGoogleTokens(
        user.id,
        tokens.access_token!,
        tokens.refresh_token ?? null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        SCOPES.join(' ')
      );

      reply.redirect('/settings?google_connected=1');
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

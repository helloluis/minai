/**
 * Microsoft OAuth2 routes for Teams Calendar integration.
 * Uses Microsoft Entra ID (Azure AD) with delegated Calendars.ReadWrite scope.
 */

import type { FastifyInstance } from 'fastify';
import * as db from '../services/db.js';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI!;
const SCOPES = 'openid profile email offline_access Calendars.ReadWrite';
const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_URL = 'https://graph.microsoft.com/v1.0';

export async function microsoftAuthRoutes(fastify: FastifyInstance) {
  // GET /api/auth/microsoft — redirect to Microsoft consent screen
  fastify.get('/api/auth/microsoft', async (request, reply) => {
    if (!CLIENT_ID) return reply.code(500).send({ error: 'Microsoft OAuth not configured' });

    const state = Buffer.from(JSON.stringify({ source: 'settings' })).toString('base64url');
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      response_mode: 'query',
      state,
      prompt: 'consent',
    });

    return reply.redirect(`${AUTH_URL}?${params.toString()}`);
  });

  // GET /api/auth/microsoft/callback — exchange code for tokens
  fastify.get('/api/auth/microsoft/callback', async (request, reply) => {
    const { code, error: oauthError } = request.query as { code?: string; error?: string };

    if (oauthError || !code) {
      console.error('[Microsoft] OAuth error:', oauthError);
      return reply.redirect('/settings?microsoft_error=1');
    }

    // The user must already be logged in (session cookie)
    const sessionToken = request.cookies?.session;
    if (!sessionToken) {
      return reply.redirect('/settings?microsoft_error=not_logged_in');
    }
    const user = await db.getUserBySession(sessionToken);
    if (!user) {
      return reply.redirect('/settings?microsoft_error=not_logged_in');
    }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
          scope: SCOPES,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('[Microsoft] Token exchange failed:', err);
        return reply.redirect('/settings?microsoft_error=token_failed');
      }

      const tokens = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        id_token?: string;
      };

      const expiry = new Date(Date.now() + tokens.expires_in * 1000);

      // Fetch user profile from Microsoft Graph
      const profileRes = await fetch(`${GRAPH_URL}/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      let msId: string | null = null;
      let msEmail: string | null = null;
      let msName: string | null = null;

      if (profileRes.ok) {
        const profile = await profileRes.json() as {
          id: string;
          mail?: string;
          userPrincipalName?: string;
          displayName?: string;
        };
        msId = profile.id;
        msEmail = profile.mail || profile.userPrincipalName || null;
        msName = profile.displayName || null;
      }

      // Save tokens
      await db.saveMicrosoftTokens(
        user.id,
        tokens.access_token,
        tokens.refresh_token ?? null,
        expiry,
        msId,
        msEmail,
        msName,
      );

      console.log(`[Microsoft] Connected for user ${user.id.slice(0, 8)}: ${msEmail}`);
      return reply.redirect('/settings?microsoft_connected=1');
    } catch (err) {
      console.error('[Microsoft] OAuth callback error:', err);
      return reply.redirect('/settings?microsoft_error=unknown');
    }
  });

  // GET /api/auth/microsoft/status — check if Microsoft is connected
  fastify.get('/api/auth/microsoft/status', async (request) => {
    const tokens = await db.getMicrosoftTokens(request.user.id);
    return {
      connected: !!tokens,
      email: tokens?.email ?? null,
      display_name: tokens?.display_name ?? null,
    };
  });

  // POST /api/auth/microsoft/disconnect — remove Microsoft tokens
  fastify.post('/api/auth/microsoft/disconnect', async (request) => {
    await db.deleteMicrosoftTokens(request.user.id);
    console.log(`[Microsoft] Disconnected for user ${request.user.id.slice(0, 8)}`);
    return { disconnected: true };
  });
}

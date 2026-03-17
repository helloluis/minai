import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { getUserBySession } from '../services/db.js';
import type { User } from '@minai/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
}

export const authPlugin = fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('user', null as unknown as User);

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public routes
    const publicPrefixes = ['/api/auth/login', '/api/health', '/api/auth/google', '/api/uploads/'];
    if (publicPrefixes.some(p => request.url.startsWith(p))) {
      return;
    }

    const sessionToken = request.cookies?.session;
    if (!sessionToken) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      reply.code(401).send({ error: 'Invalid session' });
      return;
    }

    request.user = user;
  });
});

import './env.js'; // Load .env.local before anything else

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';

const port = parseInt(process.env.API_PORT || '3001');

async function start() {
  const fastify = Fastify({ logger: true });

  // CORS — allow Next.js dev server
  await fastify.register(cors, {
    origin: ['http://localhost:3000', 'http://localhost:3002'],
    credentials: true,
  });

  // Cookies
  await fastify.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'minai-dev-secret',
  });

  // Auth middleware
  await fastify.register(authPlugin);

  // Routes
  await fastify.register(authRoutes);
  await fastify.register(conversationRoutes);
  await fastify.register(messageRoutes);

  // Health check
  fastify.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`\n🚀 Minai API running on http://localhost:${port}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

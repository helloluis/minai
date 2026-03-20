import type { FastifyInstance } from 'fastify';
import * as db from '../services/db.js';
import { seedWelcomeContent } from '../services/onboarding.js';

export async function conversationRoutes(fastify: FastifyInstance) {
  // List conversations
  fastify.get('/api/conversations', async (request) => {
    return db.getConversations(request.user.id);
  });

  // Create conversation
  fastify.post('/api/conversations', async (request) => {
    const { title } = (request.body as { title?: string }) || {};
    const userId = request.user.id;

    // Check if this is the user's first notebook
    const existing = await db.getConversations(userId);
    const conv = await db.createConversation(userId, title);

    // Seed welcome content for first-time users (fire-and-forget)
    if (existing.length === 0) {
      seedWelcomeContent(userId, conv.id).catch(console.error);
    }

    return conv;
  });

  // Update conversation
  fastify.patch<{ Params: { id: string } }>(
    '/api/conversations/:id',
    async (request) => {
      const { id } = request.params;
      const updates = request.body as { title?: string; pinned?: boolean; pin_order?: number };
      const conversation = await db.updateConversation(id, request.user.id, updates);
      if (!conversation) {
        throw { statusCode: 404, message: 'Conversation not found' };
      }
      return conversation;
    }
  );

  // Delete conversation (soft)
  fastify.delete<{ Params: { id: string } }>(
    '/api/conversations/:id',
    async (request, reply) => {
      const { id } = request.params;
      const deleted = await db.deleteConversation(id, request.user.id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }
      return { success: true };
    }
  );
}

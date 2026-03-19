import type { FastifyInstance } from 'fastify';
import type { LLMMode, SendMessageRequest } from '@minai/shared';
import * as db from '../services/db.js';
import { streamResponse } from '../services/router.js';

export async function messageRoutes(fastify: FastifyInstance) {
  // Get messages for a conversation
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; before?: string } }>(
    '/api/conversations/:id/messages',
    async (request) => {
      const { id } = request.params;
      const { limit, before } = request.query;

      // Verify conversation belongs to user
      const conversation = await db.getConversation(id, request.user.id);
      if (!conversation) {
        throw { statusCode: 404, message: 'Conversation not found' };
      }

      return db.getMessages(id, limit ? parseInt(limit) : 50, before);
    }
  );

  // Send message and stream response (SSE)
  fastify.post<{ Params: { id: string } }>(
    '/api/conversations/:id/messages/stream',
    async (request, reply) => {
      const { id } = request.params;
      const { content, mode, images, file_ids } = request.body as SendMessageRequest & { file_ids?: string[] };

      console.log(`[Messages] Received: content="${content.slice(0, 50)}", mode=${mode}, images=${images ? images.length : 0}, files=${file_ids ? file_ids.length : 0}`);

      // Verify conversation belongs to user
      const conversation = await db.getConversation(id, request.user.id);
      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      // Store user message (with images and file references if present)
      await db.createMessage(id, 'user', content, undefined, images, file_ids);

      // Create assistant message placeholder
      const assistantMsg = await db.createMessage(id, 'assistant', '', undefined);

      // Set up SSE
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Heartbeat to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        reply.raw.write(': heartbeat\n\n');
      }, 5000);

      let fullContent = '';
      let usedModel: string | null = null;

      try {
        for await (const chunk of streamResponse(
          id,
          request.user.id,
          content,
          mode as LLMMode,
          assistantMsg.id,
          images
        )) {
          // Capture model from start event
          if (chunk.type === 'start' && chunk.model) {
            usedModel = chunk.model;
          }

          // Accumulate content for storage
          if (chunk.type === 'chunk' && chunk.content) {
            fullContent += chunk.content;
          }

          reply.raw.write(`event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`);
        }

        // Update the assistant message with full content, model, and actual timestamp
        if (fullContent) {
          await db.pool.query(
            'UPDATE messages SET content = $2, created_at = NOW(), model = $3 WHERE id = $1',
            [assistantMsg.id, fullContent, usedModel]
          );
        }

        // Auto-title the conversation if it's the first message
        const messages = await db.getMessages(id, 3);
        if (messages.length <= 2 && conversation.title === 'New conversation') {
          const title = content.slice(0, 60) + (content.length > 60 ? '...' : '');
          await db.updateConversation(id, request.user.id, { title });
        }
      } catch (err) {
        console.error('[Messages] Stream error:', err);
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`);
      } finally {
        clearInterval(heartbeat);
        reply.raw.end();
      }
    }
  );

  // Delete message (soft)
  fastify.delete<{ Params: { id: string; messageId: string } }>(
    '/api/conversations/:id/messages/:messageId',
    async (request, reply) => {
      const { messageId } = request.params;
      const deleted = await db.deleteMessage(messageId);
      if (!deleted) {
        return reply.status(404).send({ error: 'Message not found' });
      }
      return { success: true };
    }
  );

  // Toggle pin on message
  fastify.post<{ Params: { id: string; messageId: string } }>(
    '/api/conversations/:id/messages/:messageId/pin',
    async (request) => {
      const { messageId } = request.params;
      const isPinned = await db.togglePin(messageId, request.user.id);
      return { pinned: isPinned };
    }
  );

  // Get all pinned messages for user
  fastify.get('/api/messages/pinned', async (request) => {
    return db.getPinnedMessages(request.user.id);
  });

  // Submit feedback for a message
  fastify.post<{ Params: { id: string; messageId: string } }>(
    '/api/conversations/:id/messages/:messageId/feedback',
    async (request) => {
      const { messageId } = request.params;
      const { feedback_text, original_prompt, original_response } = request.body as {
        feedback_text?: string;
        original_prompt: string;
        original_response: string;
      };

      const feedback = await db.createFeedback(
        messageId,
        request.user.id,
        feedback_text ?? null,
        original_prompt,
        original_response
      );
      return feedback;
    }
  );
}

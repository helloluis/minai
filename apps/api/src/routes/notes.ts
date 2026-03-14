import type { FastifyInstance } from 'fastify';
import * as db from '../services/db.js';

export async function noteRoutes(fastify: FastifyInstance) {
  // GET /api/conversations/:conversationId/notes
  fastify.get('/api/conversations/:conversationId/notes', async (request) => {
    const { conversationId } = request.params as { conversationId: string };
    // Verify the conversation belongs to this user
    const conv = await db.getConversation(conversationId, request.user.id);
    if (!conv) throw { statusCode: 404, message: 'Notebook not found' };
    return db.getNotes(conversationId, request.user.id);
  });

  // POST /api/conversations/:conversationId/notes
  fastify.post('/api/conversations/:conversationId/notes', async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const { title, content } = (request.body as { title?: string; content?: string }) ?? {};
    const conv = await db.getConversation(conversationId, request.user.id);
    if (!conv) throw { statusCode: 404, message: 'Notebook not found' };
    const note = await db.createNote(conversationId, request.user.id, title, content);
    reply.code(201);
    return note;
  });

  // PATCH /api/conversations/:conversationId/notes/:noteId
  fastify.patch('/api/conversations/:conversationId/notes/:noteId', async (request) => {
    const { noteId } = request.params as { conversationId: string; noteId: string };
    const updates = request.body as { title?: string; content?: string; display_order?: number };
    const note = await db.updateNote(noteId, request.user.id, updates);
    if (!note) throw { statusCode: 404, message: 'Note not found' };
    return note;
  });

  // DELETE /api/conversations/:conversationId/notes/:noteId
  fastify.delete('/api/conversations/:conversationId/notes/:noteId', async (request) => {
    const { noteId } = request.params as { conversationId: string; noteId: string };
    const ok = await db.deleteNote(noteId, request.user.id);
    if (!ok) throw { statusCode: 404, message: 'Note not found' };
    return { success: true };
  });
}

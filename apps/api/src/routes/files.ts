import type { FastifyInstance } from 'fastify';
import { readFile } from 'fs/promises';
import * as db from '../services/db.js';
import { storeFile, getFullPath } from '../services/file-store.js';
import { parseFileContent } from '../services/file-parser.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export async function fileRoutes(fastify: FastifyInstance) {
  // Upload file
  fastify.post<{ Params: { conversationId: string } }>(
    '/api/conversations/:conversationId/files',
    async (request, reply) => {
      const { conversationId } = request.params;
      const userId = request.user.id;

      // Verify conversation belongs to user
      const conv = await db.getConversation(conversationId, userId);
      if (!conv) return reply.status(404).send({ error: 'Conversation not found' });

      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const mimeType = data.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.status(400).send({ error: `Unsupported file type: ${mimeType}` });
      }

      const buffer = await data.toBuffer();
      const originalName = data.filename;
      const fileSize = buffer.length;

      // Store to disk
      const { storagePath, fullPath } = await storeFile(userId, buffer, originalName);

      // Create DB record
      const file = await db.createNotebookFile(conversationId, userId, originalName, mimeType, fileSize, storagePath);

      // Parse text content (fire-and-forget — don't block the response)
      parseFileContent(fullPath, mimeType).then(async (result) => {
        await db.updateNotebookFile(file.id, userId, {
          parsed_text: result.text || undefined,
          parse_status: result.error ? 'failed' : 'done',
          parse_error: result.error || undefined,
        });
        console.log(`[Files] Parsed ${originalName}: ${result.error ? 'FAILED - ' + result.error : `${result.text.length} chars`}`);
      }).catch((err) => {
        console.error(`[Files] Parse error for ${originalName}:`, err);
        db.updateNotebookFile(file.id, userId, { parse_status: 'failed', parse_error: 'Unexpected parse error' });
      });

      reply.code(201);
      return {
        id: file.id,
        conversation_id: file.conversation_id,
        original_name: file.original_name,
        display_name: file.display_name,
        mime_type: file.mime_type,
        file_size: file.file_size,
        parse_status: file.parse_status,
        created_at: file.created_at,
        updated_at: file.updated_at,
      };
    }
  );

  // List files
  fastify.get<{ Params: { conversationId: string } }>(
    '/api/conversations/:conversationId/files',
    async (request) => {
      const files = await db.getNotebookFiles(request.params.conversationId, request.user.id);
      return files.map((f) => ({
        id: f.id,
        conversation_id: f.conversation_id,
        original_name: f.original_name,
        display_name: f.display_name,
        mime_type: f.mime_type,
        file_size: f.file_size,
        parse_status: f.parse_status,
        created_at: f.created_at,
        updated_at: f.updated_at,
      }));
    }
  );

  // Rename file
  fastify.patch<{ Params: { conversationId: string; fileId: string }; Body: { display_name: string } }>(
    '/api/conversations/:conversationId/files/:fileId',
    async (request, reply) => {
      const { display_name } = request.body;
      if (!display_name?.trim()) return reply.status(400).send({ error: 'display_name required' });

      const updated = await db.updateNotebookFile(request.params.fileId, request.user.id, {
        display_name: display_name.trim(),
      });
      if (!updated) return reply.status(404).send({ error: 'File not found' });
      return { id: updated.id, display_name: updated.display_name };
    }
  );

  // Delete file (soft)
  fastify.delete<{ Params: { conversationId: string; fileId: string } }>(
    '/api/conversations/:conversationId/files/:fileId',
    async (request, reply) => {
      const deleted = await db.deleteNotebookFile(request.params.fileId, request.user.id);
      if (!deleted) return reply.status(404).send({ error: 'File not found' });
      return { success: true };
    }
  );

  // Download original file
  fastify.get<{ Params: { conversationId: string; fileId: string } }>(
    '/api/conversations/:conversationId/files/:fileId/download',
    async (request, reply) => {
      const file = await db.getNotebookFile(request.params.fileId, request.user.id);
      if (!file) return reply.status(404).send({ error: 'File not found' });

      const fullPath = getFullPath(file.storage_path);
      try {
        const data = await readFile(fullPath);
        reply.header('Content-Type', file.mime_type);
        reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        reply.header('Cache-Control', 'private, max-age=3600');
        return reply.send(data);
      } catch {
        return reply.status(404).send({ error: 'File not found on disk' });
      }
    }
  );
}

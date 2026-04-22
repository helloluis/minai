import type { FastifyInstance } from 'fastify';
import * as db from '../services/db.js';
import { DashScopeProvider } from '../services/providers/dashscope.js';

const provider = new DashScopeProvider(process.env.DASHSCOPE_API_KEY!);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const RECOMPOSE_PROMPT = `You are an editor. The user will give you an AI assistant response from a conversation. Your job:

1. Generate a short, descriptive TITLE (max 80 chars) for this content — it should read like a blog post title.
2. Rewrite the content to remove ALL conversational filler: greetings, "great question!", "would you like me to...", "let me know if...", "here's what I found:", "I'd be happy to help", etc. Keep ONLY the factual substance. Preserve markdown formatting, lists, links, and data.

Respond in this exact JSON format:
{"title": "The Title", "content": "The recomposed content in markdown"}

Only output valid JSON, nothing else.`;

export async function shareRoutes(fastify: FastifyInstance) {
  // POST /api/share — create a shared post from a message
  fastify.post<{ Body: { message_id: string } }>(
    '/api/share',
    async (request, reply) => {
      const userId = request.user?.id;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { message_id } = request.body;
      if (!message_id) return reply.code(400).send({ error: 'message_id required' });

      // Verify the message exists and belongs to the user
      const { rows: msgRows } = await db.pool.query(
        `SELECT m.* FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.id = $1 AND c.user_id = $2 AND m.deleted_at IS NULL`,
        [message_id, userId]
      );
      if (msgRows.length === 0) {
        return reply.code(404).send({ error: 'Message not found' });
      }
      const message = msgRows[0];

      // Check if already shared
      const { rows: existingRows } = await db.pool.query(
        'SELECT slug FROM shared_posts WHERE message_id = $1',
        [message_id]
      );
      if (existingRows.length > 0) {
        return {
          ok: true,
          slug: existingRows[0].slug,
          url: `https://share.minai.work/${existingRows[0].slug}`,
          already_shared: true,
        };
      }

      // Use LLM to recompose
      let title: string;
      let recomposedContent: string;

      try {
        let llmOutput = '';
        for await (const chunk of provider.stream({
          model: 'qwen3.6-flash',
          messages: [
            { role: 'system', content: RECOMPOSE_PROMPT },
            { role: 'user', content: message.content },
          ],
        })) {
          if (chunk.type === 'content' && chunk.content) {
            llmOutput += chunk.content;
          }
        }

        // Strip markdown code fences if present
        llmOutput = llmOutput.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
        const parsed = JSON.parse(llmOutput);
        title = parsed.title || 'Shared from minai';
        recomposedContent = parsed.content || message.content;
      } catch (err) {
        console.error('[Share] LLM recompose failed, using original:', err);
        title = message.content.slice(0, 80).replace(/\n/g, ' ');
        recomposedContent = message.content;
      }

      const slug = `${shortId()}-${slugify(title)}`;

      const { rows: insertRows } = await db.pool.query(
        `INSERT INTO shared_posts (slug, user_id, message_id, title, content, original_content)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING slug`,
        [slug, userId, message_id, title, recomposedContent, message.content]
      );

      console.log(`[Share] Created: ${slug} by ${userId.slice(0, 8)}`);

      return {
        ok: true,
        slug: insertRows[0].slug,
        title,
        content: recomposedContent,
        url: `https://share.minai.work/${insertRows[0].slug}`,
      };
    }
  );

  // GET /api/share/:slug — public, no auth required
  fastify.get<{ Params: { slug: string } }>(
    '/api/share/:slug',
    async (request, reply) => {
      const { slug } = request.params;
      const { rows } = await db.pool.query(
        `SELECT sp.title, sp.content, sp.created_at, u.display_name
         FROM shared_posts sp
         JOIN users u ON u.id = sp.user_id
         WHERE sp.slug = $1`,
        [slug]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Post not found' });
      }

      return rows[0];
    }
  );
}

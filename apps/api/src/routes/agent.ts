import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { getUserBySession, createMessage, getConversation } from '../services/db.js';
import {
  sessionManager, type PiRpcProcess,
  getInstalledSkills, getAvailableTemplates, installSkill, removeSkill,
} from '../services/pi-agent.js';

export async function agentRoutes(fastify: FastifyInstance) {
  // WebSocket endpoint for pi agent communication
  fastify.get('/api/agent/ws', { websocket: true }, async (socket: WebSocket, request) => {
    const url = new URL(request.url, `http://localhost`);
    const sessionToken = url.searchParams.get('session') || '';
    const conversationId = url.searchParams.get('conversation') || '';

    if (!sessionToken) {
      socket.send(JSON.stringify({ type: 'error', error: 'session parameter required' }));
      socket.close();
      return;
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      socket.send(JSON.stringify({ type: 'error', error: 'Invalid session' }));
      socket.close();
      return;
    }

    // Verify conversation belongs to user (needed for persistence)
    let convId = conversationId;
    if (convId) {
      const conv = await getConversation(convId, user.id);
      if (!conv) convId = ''; // invalid — don't persist
    }

    console.log(`[agent:ws] Connected user=${user.id.slice(0, 8)}... conv=${convId.slice(0, 8) || 'none'}`);

    let rpc: PiRpcProcess;
    try {
      rpc = sessionManager.getOrCreate(user.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start agent';
      socket.send(JSON.stringify({ type: 'error', error: message }));
      socket.close();
      return;
    }

    // Track streaming assistant content for persistence
    let assistantBuffer = '';

    // Forward pi output to WebSocket + persist assistant messages
    const listener = (piMsg: Record<string, unknown>) => {
      if (socket.readyState !== 1) return; // WebSocket.OPEN
      socket.send(JSON.stringify(piMsg));

      // Accumulate assistant text for persistence
      if (piMsg.type === 'message_update') {
        const event = piMsg.assistantMessageEvent as Record<string, unknown> | undefined;
        if (event?.type === 'text_delta' && typeof event.delta === 'string') {
          assistantBuffer += event.delta;
        }
        // On message complete, persist the full assistant response
        if (event?.type === 'done' && convId && assistantBuffer.trim()) {
          createMessage(convId, 'assistant', assistantBuffer.trim(), undefined, undefined, undefined, 'agent')
            .catch((err) => console.error('[agent:ws] Failed to persist assistant message:', err));
          assistantBuffer = '';
        }
      }
    };
    rpc.addListener(listener);

    // Send initial state
    socket.send(JSON.stringify({ type: 'auth_ok' }));
    try {
      rpc.send({ type: 'get_state' });
    } catch {
      // Process may not support get_state
    }

    // Forward user messages to pi + persist user messages
    socket.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'new_session') {
          sessionManager.restart(user.id);
          rpc = sessionManager.getOrCreate(user.id);
          rpc.addListener(listener);
          socket.send(JSON.stringify({ type: 'auth_ok' }));
          return;
        }

        // Persist user prompts
        if (msg.type === 'prompt' && typeof msg.message === 'string' && convId) {
          createMessage(convId, 'user', msg.message, undefined, undefined, undefined, 'agent')
            .catch((err) => console.error('[agent:ws] Failed to persist user message:', err));
          assistantBuffer = ''; // reset for next response
        }

        rpc.send(msg);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Invalid message';
        socket.send(JSON.stringify({ type: 'error', error: message }));
      }
    });

    socket.on('close', () => {
      console.log(`[agent:ws] Disconnected user=${user.id.slice(0, 8)}...`);
      // Persist any buffered assistant content on disconnect
      if (convId && assistantBuffer.trim()) {
        createMessage(convId, 'assistant', assistantBuffer.trim(), undefined, undefined, undefined, 'agent')
          .catch(console.error);
      }
      rpc.removeListener(listener);
    });
  });

  // Returns session token for WS auth (cookie is httpOnly, JS can't read it)
  fastify.get('/api/agent/token', async (request) => {
    return { token: request.user.session_token };
  });

  // REST endpoint for session info
  fastify.get('/api/agent/status', async (request) => {
    return sessionManager.stats();
  });

  // ── Skill management ──

  // List installed skills
  fastify.get('/api/agent/skills', async (request) => {
    return { skills: getInstalledSkills(request.user.id) };
  });

  // List available skill templates
  fastify.get('/api/agent/skill-templates', async (request) => {
    return { templates: getAvailableTemplates() };
  });

  // Install a skill
  fastify.post('/api/agent/skills', async (request, reply) => {
    const { name, template, skillMd, config, files } = request.body as {
      name: string;
      template?: string;
      skillMd?: string;
      config?: Record<string, unknown>;
      files?: Record<string, string>;
    };

    if (!name || !/^[a-z0-9-]+$/.test(name)) {
      return reply.status(400).send({ error: 'Skill name must be lowercase alphanumeric with dashes' });
    }

    const ok = installSkill(request.user.id, name, { template, skillMd, config, files });
    if (!ok) {
      return reply.status(400).send({ error: 'Failed to install skill' });
    }

    // Restart session so it picks up the new skill in its system prompt
    sessionManager.restart(request.user.id);

    return { ok: true, skill: name };
  });

  // Delete a skill
  fastify.delete<{ Params: { skillName: string } }>(
    '/api/agent/skills/:skillName',
    async (request, reply) => {
      const { skillName } = request.params;
      const ok = removeSkill(request.user.id, skillName);
      if (!ok) {
        return reply.status(400).send({ error: 'Cannot remove default skill or skill not found' });
      }

      sessionManager.restart(request.user.id);
      return { ok: true, removed: skillName };
    }
  );
}

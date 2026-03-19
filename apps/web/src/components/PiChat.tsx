'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePiAgentStore } from '@/hooks/usePiAgentStore';
import { useChatStore } from '@/hooks/useChatStore';
import * as api from '@/lib/api';
import type { AgentSkill } from '@/lib/api';
import type { PiAgentMessage } from '@minai/shared';

// Starter prompts per skill — placed in the input for the user to finish
const SKILL_STARTERS: Record<string, string> = {
  'write-email': 'Write an email to ',
  'summarize': 'Summarize this: ',
  'brainstorm': 'Help me brainstorm ideas for ',
};

const NEW_SKILL_STARTER = 'Create a skill that helps me ';

function ToolBlock({ msg }: { msg: PiAgentMessage }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-800/50 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono text-minai-400">{msg.toolName}</span>
        {msg.toolOutput && (
          <span className="text-gray-600 ml-auto">completed</span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-700 px-3 py-2 space-y-2">
          {msg.toolInput && (
            <div>
              <div className="text-[10px] uppercase text-gray-500 mb-1">Input</div>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all bg-gray-900 rounded p-2 max-h-40 overflow-auto">
                {msg.toolInput}
              </pre>
            </div>
          )}
          {msg.toolOutput && (
            <div>
              <div className="text-[10px] uppercase text-gray-500 mb-1">Output</div>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all bg-gray-900 rounded p-2 max-h-60 overflow-auto">
                {msg.toolOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: PiAgentMessage }) {
  if (msg.role === 'tool') {
    return <ToolBlock msg={msg} />;
  }

  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? 'bg-minai-600 text-white'
            : 'bg-gray-800 text-gray-200'
          }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

function SkillButton({ skill, onClick }: { skill: AgentSkill; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-700 text-left
        hover:border-minai-500 hover:bg-gray-800/50 transition-colors group"
    >
      <svg className="w-4 h-4 text-minai-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <div className="min-w-0">
        <div className="text-sm text-gray-200 group-hover:text-white font-medium truncate">{skill.name}</div>
        <div className="text-xs text-gray-500 truncate">{skill.description}</div>
      </div>
    </button>
  );
}

export default function PiChat({ conversationId }: { conversationId?: string } = {}) {
  const {
    status, error, messages, streamingContent, isStreaming,
    connect, disconnect, sendMessage, newSession, abort,
  } = usePiAgentStore();
  const { session } = useChatStore();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadSkills = useCallback(() => {
    api.getAgentSkills()
      .then(({ skills }) => setSkills(skills))
      .catch(console.error);
  }, []);

  // Connect on mount — fetch session token via API (cookie is httpOnly)
  useEffect(() => {
    if (session?.user && status === 'disconnected') {
      api.getAgentToken()
        .then(({ token }) => connect(token, conversationId))
        .catch((err) => console.error('[openclaw] Failed to get token:', err));
    }
  }, [session, status, connect]);

  // Load skills when connected
  useEffect(() => {
    if (status === 'connected') loadSkills();
  }, [status, loadSkills]);

  // Refresh skills after agent finishes (it may have created a new skill)
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant' || (last.role === 'tool' && last.toolOutput)) {
        loadSkills();
      }
    }
  }, [isStreaming, messages, loadSkills]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isStreaming) return;
    sendMessage(msg);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSkillClick = (skill: AgentSkill) => {
    const starter = SKILL_STARTERS[skill.name] || `Use the ${skill.name} skill to `;
    setInput(starter);
    inputRef.current?.focus();
  };

  const handleNewSkill = () => {
    setInput(NEW_SKILL_STARTER);
    inputRef.current?.focus();
  };

  const statusColor = {
    disconnected: 'bg-gray-500',
    connecting: 'bg-yellow-500 animate-pulse',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  }[status];

  const statusText = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: error || 'Error',
  }[status];

  const showEmptyState = messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400"
            title="Back"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-minai-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-semibold text-sm">OpenClaw</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            <span>{statusText}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={newSession}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400
              hover:border-gray-600 hover:text-gray-300 transition-colors"
          >
            New Session
          </button>
          {status === 'disconnected' || status === 'error' ? (
            <button
              onClick={() => {
                api.getAgentToken()
                  .then(({ token }) => connect(token))
                  .catch(console.error);
              }}
              className="px-3 py-1.5 text-xs rounded-lg bg-minai-600 text-white
                hover:bg-minai-500 transition-colors"
            >
              Reconnect
            </button>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {showEmptyState && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-400 text-sm mb-1">Use skills or create your own</p>
              <p className="text-gray-500 text-xs mb-5">Skills are shortcuts for things you do often. OpenClaw writes the code behind them so you don't have to.</p>

              {/* Skills grid */}
              {skills.length > 0 && (
                <div className="grid grid-cols-1 gap-2 mb-3">
                  {skills.map((skill) => (
                    <SkillButton
                      key={skill.name}
                      skill={skill}
                      onClick={() => handleSkillClick(skill)}
                    />
                  ))}
                </div>
              )}

              {/* Add skill button */}
              <button
                onClick={handleNewSkill}
                disabled={status !== 'connected'}
                className="flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-xs
                  text-gray-500 hover:text-minai-400 hover:bg-gray-800/50 transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create new skill
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Streaming indicator */}
        {isStreaming && streamingContent && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-gray-800 text-gray-200">
              {streamingContent}
              <span className="inline-block w-1.5 h-4 bg-minai-400 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex justify-start mb-3">
            <div className="rounded-2xl px-4 py-2.5 bg-gray-800">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-800 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={status === 'connected' ? 'Ask OpenClaw...' : 'Connecting...'}
            disabled={status !== 'connected'}
            rows={1}
            className="flex-1 resize-none bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm
              text-gray-100 placeholder-gray-500 focus:outline-none focus:border-minai-500
              disabled:opacity-50 disabled:cursor-not-allowed
              max-h-32 overflow-y-auto"
            style={{ minHeight: '42px' }}
          />
          {isStreaming ? (
            <button
              onClick={abort}
              className="flex-shrink-0 p-2.5 rounded-xl bg-red-600 text-white
                hover:bg-red-500 transition-colors"
              title="Stop"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || status !== 'connected'}
              className="flex-shrink-0 p-2.5 rounded-xl bg-minai-600 text-white
                hover:bg-minai-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

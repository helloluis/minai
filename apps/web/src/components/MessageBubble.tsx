'use client';

import type { Message } from '@minai/shared';

interface MessageBubbleProps {
  message: Message;
  onDelete?: (id: string) => void;
}

/**
 * Simple markdown-to-HTML renderer.
 * Handles: bold, italic, inline code, code blocks, links, lists, tables.
 */
function renderMarkdown(text: string): string {
  let html = text;

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Tables
  html = html.replace(/(?:^|\n)(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/g, (_match, header, _sep, body) => {
    const headerCells = parseCells(header);
    const bodyRows = body.trim().split('\n').map(parseCells);
    const thead = `<tr>${headerCells.map((c: string) => `<th>${inlineMarkdown(c)}</th>`).join('')}</tr>`;
    const tbody = bodyRows.map((row: string[]) => `<tr>${row.map((c: string) => `<td>${inlineMarkdown(c)}</td>`).join('')}</tr>`).join('');
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  });

  // Split into lines for block-level processing
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType = '';

  for (const line of lines) {
    // Skip already processed pre blocks
    if (line.startsWith('<pre>') || line.startsWith('<table>')) {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      result.push(line);
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*]\s/.test(line)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${inlineMarkdown(line.replace(/^[\s]*[-*]\s/, ''))}</li>`);
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${inlineMarkdown(line.replace(/^[\s]*\d+\.\s/, ''))}</li>`);
      continue;
    }

    if (inList) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Headers
    if (line.startsWith('### ')) { result.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { result.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { result.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`); continue; }

    // Blockquote
    if (line.startsWith('> ')) { result.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); continue; }

    // Empty line
    if (!line.trim()) { result.push(''); continue; }

    // Regular paragraph
    result.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');

  return result.join('\n');
}

function inlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseCells(row: string): string[] {
  return row.split('|').slice(1, -1).map((c: string) => c.trim());
}

export function MessageBubble({ message, onDelete }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-minai-600 text-white rounded-br-md'
            : 'bg-gray-100 dark:bg-gray-800 rounded-bl-md'
          }`}
      >
        {/* Model badge for assistant messages */}
        {!isUser && message.model && (
          <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">
            {message.model === 'qwen-turbo-latest' ? 'Flash' : 'Plus'}
          </div>
        )}

        {/* Message content */}
        <div
          className="message-content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />

        {/* Token info (small) */}
        {!isUser && message.output_tokens > 0 && (
          <div className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-2">
            <span>{message.output_tokens} tokens</span>
            {message.token_cost_usd > 0 && (
              <span>${Number(message.token_cost_usd).toFixed(4)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { decorateHtml } from '@/lib/decorator';

interface SharedPost {
  title: string;
  content: string;
  created_at: string;
  display_name: string | null;
}

async function getPost(slug: string): Promise<SharedPost | null> {
  const apiBase = process.env.INTERNAL_API_URL || 'http://localhost:3006';
  try {
    const res = await fetch(`${apiBase}/api/share/${slug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function renderMarkdownServer(text: string): string {
  let html = text;

  // Code blocks
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _l, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${esc(code.trim())}</code></pre>`);
    return `\x00CB${idx}\x00`;
  });

  // Tables
  const tableBlocks: string[] = [];
  html = html.replace(/(?:^|\n)(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/g, (_m, header, _sep, body) => {
    const hCells = header.split('|').slice(1, -1).map((c: string) => `<th>${inl(c.trim())}</th>`).join('');
    const rows = body.trim().split('\n').map((r: string) =>
      '<tr>' + r.split('|').slice(1, -1).map((c: string) => `<td>${inl(c.trim())}</td>`).join('') + '</tr>'
    ).join('');
    const idx = tableBlocks.length;
    tableBlocks.push(`<table><thead><tr>${hCells}</tr></thead><tbody>${rows}</tbody></table>`);
    return `\n\x00TB${idx}\x00\n`;
  });

  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listTag = '';

  for (const line of lines) {
    if (line.includes('\x00CB')) { if (inList) { result.push(`</${listTag}>`); inList = false; } const idx = parseInt(line.match(/\x00CB(\d+)\x00/)?.[1] ?? '0'); result.push(codeBlocks[idx]); continue; }
    if (line.includes('\x00TB')) { if (inList) { result.push(`</${listTag}>`); inList = false; } const idx = parseInt(line.match(/\x00TB(\d+)\x00/)?.[1] ?? '0'); result.push(tableBlocks[idx]); continue; }

    if (line.startsWith('### ')) { if (inList) { result.push(`</${listTag}>`); inList = false; } result.push(`<h3>${inl(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { if (inList) { result.push(`</${listTag}>`); inList = false; } result.push(`<h2>${inl(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { if (inList) { result.push(`</${listTag}>`); inList = false; } result.push(`<h1>${inl(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('> ')) { if (inList) { result.push(`</${listTag}>`); inList = false; } result.push(`<blockquote>${inl(line.slice(2))}</blockquote>`); continue; }

    if (/^\s*[-*]\s/.test(line)) {
      if (!inList || listTag !== 'ul') { if (inList) result.push(`</${listTag}>`); result.push('<ul>'); inList = true; listTag = 'ul'; }
      result.push(`<li>${inl(line.replace(/^\s*[-*]\s/, ''))}</li>`);
      continue;
    }
    if (/^\s*\d+\.\s/.test(line)) {
      if (!inList || listTag !== 'ol') { if (inList) result.push(`</${listTag}>`); result.push('<ol>'); inList = true; listTag = 'ol'; }
      result.push(`<li>${inl(line.replace(/^\s*\d+\.\s/, ''))}</li>`);
      continue;
    }

    if (inList) { result.push(`</${listTag}>`); inList = false; }
    if (!line.trim()) { result.push(''); continue; }
    result.push(`<p>${inl(line)}</p>`);
  }
  if (inList) result.push(`</${listTag}>`);
  return result.join('\n');
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inl(text: string): string {
  // Inline code
  const codes: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_m, c) => { const i = codes.length; codes.push(`<code>${esc(c)}</code>`); return `\x00IC${i}\x00`; });
  // Links
  const links: string[] = [];
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => { const i = links.length; links.push(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`); return `\x00LK${i}\x00`; });
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\x00IC(\d+)\x00/g, (_m, i) => codes[parseInt(i)]);
  s = s.replace(/\x00LK(\d+)\x00/g, (_m, i) => links[parseInt(i)]);
  return s;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  return {
    title: post ? `${post.title} | minai — AI for the rest of us` : 'minai — AI for the rest of us',
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const date = new Date(post.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const renderedHtml = decorateHtml(renderMarkdownServer(post.content));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Content */}
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-2xl px-6 py-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-5">
              <a href="https://minai.work" className="text-minai-400 hover:text-minai-300 text-sm font-semibold transition-colors">
                minai
              </a>
              <span className="text-gray-700">/</span>
              <span className="text-gray-500 text-sm">shared</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-100 mb-3 leading-tight">{post.title}</h1>
            <div className="text-sm text-gray-500">
              {post.display_name && <span>by {post.display_name} &middot; </span>}
              {date}
            </div>
          </div>

          {/* Article */}
          <article
            className="message-content
              [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-gray-100
              [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-gray-200
              [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-gray-200
              [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-gray-300
              [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:text-gray-300
              [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:text-gray-300
              [&_li]:mb-1.5
              [&_blockquote]:border-l-3 [&_blockquote]:border-minai-500 [&_blockquote]:pl-4 [&_blockquote]:py-2 [&_blockquote]:my-3 [&_blockquote]:text-gray-400 [&_blockquote]:italic
              [&_pre]:bg-gray-900 [&_pre]:border [&_pre]:border-gray-800 [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:text-sm
              [&_code]:bg-gray-800/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-minai-300 [&_code]:text-[13px]
              [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-300
              [&_a]:text-minai-400 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-minai-300
              [&_strong]:text-gray-200 [&_strong]:font-semibold
              [&_em]:text-gray-400
              [&_table]:w-full [&_table]:mb-4 [&_table]:border-collapse [&_table]:text-sm
              [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-gray-700 [&_th]:text-gray-300 [&_th]:font-semibold [&_th]:bg-gray-900/50
              [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-gray-800 [&_td]:text-gray-400"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>
      </div>

      {/* Footer — clickable CTA */}
      <a
        href="https://minai.work"
        className="block border-t border-gray-800 bg-gray-900/50 hover:bg-gray-900 transition-colors"
      >
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center justify-center gap-2">
          <img src="/icon.svg" alt="minai" className="w-5 h-5" />
          <p className="text-sm text-gray-400">
            <span className="text-minai-400 font-semibold">minai.work</span> is AI for the rest of us! Try it for free today.
          </p>
        </div>
      </a>
    </div>
  );
}

import { notFound } from 'next/navigation';

interface SharedPost {
  title: string;
  content: string;
  created_at: string;
  display_name: string | null;
}

async function getPost(slug: string): Promise<SharedPost | null> {
  const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${apiBase}/api/share/${slug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function renderMarkdownServer(text: string): string {
  // Lightweight server-side markdown — bold, italic, code, headers, lists, links, paragraphs
  let html = text;

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _l, code) =>
    `<pre><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()}</code></pre>`
  );

  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listTag = '';

  for (const line of lines) {
    if (line.startsWith('### ')) { if (inList) { result.push(`</${listTag}>`); inList = false; } result.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { if (inList) { result.push(`</${listTag}>`); inList = false; } result.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { if (inList) { result.push(`</${listTag}>`); inList = false; } result.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }

    if (/^\s*[-*]\s/.test(line)) {
      if (!inList || listTag !== 'ul') { if (inList) result.push(`</${listTag}>`); result.push('<ul>'); inList = true; listTag = 'ul'; }
      result.push(`<li>${inline(line.replace(/^\s*[-*]\s/, ''))}</li>`);
      continue;
    }
    if (/^\s*\d+\.\s/.test(line)) {
      if (!inList || listTag !== 'ol') { if (inList) result.push(`</${listTag}>`); result.push('<ol>'); inList = true; listTag = 'ol'; }
      result.push(`<li>${inline(line.replace(/^\s*\d+\.\s/, ''))}</li>`);
      continue;
    }

    if (inList) { result.push(`</${listTag}>`); inList = false; }
    if (!line.trim()) { result.push(''); continue; }
    result.push(`<p>${inline(line)}</p>`);
  }
  if (inList) result.push(`</${listTag}>`);
  return result.join('\n');
}

function inline(text: string): string {
  let s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const date = new Date(post.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <a href="https://minai.work" className="text-minai-400 hover:text-minai-300 text-sm font-medium transition-colors">
              minai
            </a>
            <span className="text-gray-600">/</span>
            <span className="text-gray-500 text-sm">shared</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-100 mb-2">{post.title}</h1>
          <div className="text-sm text-gray-500">
            {post.display_name && <span>by {post.display_name} &middot; </span>}
            {date}
          </div>
        </div>

        {/* Content */}
        <article
          className="message-content prose prose-invert prose-sm max-w-none
            [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3
            [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2
            [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
            [&_p]:mb-3 [&_p]:leading-relaxed
            [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc
            [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal
            [&_li]:mb-1
            [&_pre]:bg-gray-900 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:mb-3 [&_pre]:overflow-x-auto
            [&_code]:bg-gray-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-minai-300 [&_code]:text-xs
            [&_pre_code]:bg-transparent [&_pre_code]:p-0
            [&_a]:text-minai-400 [&_a]:underline
            [&_strong]:text-gray-200"
          dangerouslySetInnerHTML={{ __html: renderMarkdownServer(post.content) }}
        />

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-800">
          <p className="text-sm text-gray-500 mb-3">
            Shared from <a href="https://minai.work" className="text-minai-400 hover:text-minai-300">minai</a> — ultra low-cost AI for everyone.
          </p>
        </div>
      </div>
    </div>
  );
}

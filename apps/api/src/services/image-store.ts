/**
 * Downloads DashScope-generated images to local disk so they never expire.
 * Serves from /api/uploads/:filename → permanent URLs.
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { v4 as uuidv4 } from 'uuid';

export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');
}

export function getPublicUrl(filename: string): string {
  const base = (process.env.PUBLIC_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  return `${base}/api/uploads/${filename}`;
}

/**
 * Downloads an image from a temporary URL (e.g. DashScope OSS),
 * saves it to the uploads dir, and returns a permanent public URL.
 */
export async function persistImage(tempUrl: string): Promise<string> {
  const dir = getUploadsDir();
  await mkdir(dir, { recursive: true });

  const response = await fetch(tempUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);

  const contentType = response.headers.get('content-type') ?? 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
  const filename = `${uuidv4()}.${ext}`;

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(join(dir, filename), buffer);

  console.log(`[ImageStore] Saved ${filename} (${buffer.length} bytes)`);
  return getPublicUrl(filename);
}

/**
 * Strip hallucinated image URLs from an LLM response.
 * Looks for any /api/uploads/<filename> reference and, if the file doesn't
 * exist on disk, removes the enclosing markdown image/link. This prevents
 * broken-image renders when the LLM fabricates a URL instead of calling
 * the image tool.
 */
export function stripHallucinatedUploads(content: string): string {
  const dir = getUploadsDir();
  const pattern = /\/api\/uploads\/([A-Za-z0-9._-]+)/g;
  const missing = new Set<string>();

  for (const match of content.matchAll(pattern)) {
    const filename = basename(match[1]);
    if (!existsSync(join(dir, filename))) {
      missing.add(filename);
    }
  }

  if (missing.size === 0) return content;

  let cleaned = content;
  for (const filename of missing) {
    console.warn(`[ImageStore] Stripping hallucinated URL: ${filename}`);
    const urlFragment = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Remove entire markdown image or link containing the missing file
    const mdPattern = new RegExp(`!?\\[[^\\]]*\\]\\([^)]*${urlFragment}[^)]*\\)`, 'g');
    cleaned = cleaned.replace(mdPattern, '');
    // Also remove orphan ](url) patterns
    cleaned = cleaned.replace(new RegExp(`\\]\\([^)]*${urlFragment}[^)]*\\)`, 'g'), '');
    // Remove bare URL references
    cleaned = cleaned.replace(new RegExp(`https?://\\S*${urlFragment}\\S*`, 'g'), '');
  }

  if (missing.size > 0) {
    cleaned = cleaned.trimStart();
    const warning = `\n\n_(Note: I attempted to reference an image but the generation didn't complete. Please ask me to try again.)_`;
    cleaned = cleaned + warning;
  }

  return cleaned;
}

/**
 * Downloads DashScope-generated images to local disk so they never expire.
 * Serves from /api/uploads/:filename → permanent URLs.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
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

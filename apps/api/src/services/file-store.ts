/**
 * File storage — saves uploaded documents to disk in user-specific directories.
 */

import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

export function getFilesDir(): string {
  return process.env.FILES_DIR ?? join(process.cwd(), 'uploads', 'files');
}

export async function storeFile(
  userId: string,
  buffer: Buffer,
  originalName: string,
): Promise<{ storagePath: string; fullPath: string }> {
  const userDir = join(getFilesDir(), userId);
  await mkdir(userDir, { recursive: true });

  const ext = extname(originalName) || '.bin';
  const filename = `${uuidv4()}${ext}`;
  const fullPath = join(userDir, filename);
  const storagePath = `${userId}/${filename}`;

  await writeFile(fullPath, buffer);
  console.log(`[FileStore] Saved ${storagePath} (${buffer.length} bytes)`);

  return { storagePath, fullPath };
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  try {
    await unlink(join(getFilesDir(), storagePath));
  } catch {
    // file may already be gone
  }
}

export function getFullPath(storagePath: string): string {
  return join(getFilesDir(), storagePath);
}

/**
 * New user onboarding — creates a sample note and welcome PDF in their first notebook.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { storeFile } from './file-store.js';
import { parseFileContent } from './file-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WELCOME_PDF_PATH = join(__dirname, '..', 'assets', 'welcome.pdf');

const WELCOME_NOTE_TITLE = 'Welcome to minai!';
const WELCOME_NOTE_CONTENT = `<p>Thanks for trying out minai! This is a sample note that you can edit or delete any time you want.</p>
<p>Please have a look around, try out various things, and let us know what you think!</p>
<ul>
<li>💬 <strong>Chat</strong> with minai — ask questions, manage your calendar, analyze documents</li>
<li>📄 <strong>Notes</strong> — create and organize your thoughts right here in the sidebar</li>
<li>📎 <strong>Files</strong> — upload PDFs, docs, and images for minai to analyze</li>
<li>⚡ <strong>Feature suggestions</strong> — tell minai about a feature you'd like and earn up to $10 in credits!</li>
</ul>`;

/**
 * Seed a new user's first notebook with a welcome note and welcome PDF.
 * Call this after creating the user's first conversation.
 * Fire-and-forget — errors are logged but don't break registration.
 */
export async function seedWelcomeContent(userId: string, conversationId: string): Promise<void> {
  try {
    // Create welcome note
    await db.createNote(conversationId, userId, WELCOME_NOTE_TITLE, WELCOME_NOTE_CONTENT);
    console.log(`[Onboarding] Created welcome note for user ${userId.slice(0, 8)}`);

    // Copy welcome PDF into user's file storage
    const pdfBuffer = readFileSync(WELCOME_PDF_PATH);
    const { storagePath } = await storeFile(userId, pdfBuffer, 'Welcome to minai.pdf');

    // Create file record in DB
    const file = await db.createNotebookFile(
      conversationId,
      userId,
      'Welcome to minai.pdf',
      'application/pdf',
      pdfBuffer.length,
      storagePath,
    );

    // Parse text (fire-and-forget)
    const { getFullPath } = await import('./file-store.js');
    const fullPath = getFullPath(storagePath);
    parseFileContent(fullPath, 'application/pdf').then(async (result) => {
      await db.updateNotebookFile(file.id, userId, {
        parsed_text: result.text || undefined,
        parse_status: result.error ? 'failed' : 'done',
        parse_error: result.error || undefined,
      });
    }).catch(console.error);

    console.log(`[Onboarding] Created welcome PDF for user ${userId.slice(0, 8)}`);
  } catch (err) {
    console.error(`[Onboarding] Failed for user ${userId.slice(0, 8)}:`, err);
  }
}

/**
 * Universal document parser — extracts text from PDFs, DOCX, DOC, TXT, CSV, Markdown.
 */

import { readFile } from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

const MAX_TEXT_LENGTH = 500_000; // cap stored text at 500K chars

export interface ParseResult {
  text: string;
  error?: string;
}

export async function parseFileContent(filePath: string, mimeType: string): Promise<ParseResult> {
  try {
    // Plain text family
    if (
      mimeType === 'text/plain' ||
      mimeType === 'text/csv' ||
      mimeType === 'text/markdown' ||
      mimeType === 'text/html'
    ) {
      const text = await readFile(filePath, 'utf-8');
      return { text: text.slice(0, MAX_TEXT_LENGTH) };
    }

    // PDF
    if (mimeType === 'application/pdf') {
      const buffer = await readFile(filePath);
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      return { text: result.text.slice(0, MAX_TEXT_LENGTH) };
    }

    // DOCX / DOC
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      return { text: result.value.slice(0, MAX_TEXT_LENGTH) };
    }

    return { text: '', error: `Unsupported file type: ${mimeType}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown parse error';
    console.error(`[FileParser] Failed to parse ${filePath} (${mimeType}):`, msg);
    return { text: '', error: msg };
  }
}

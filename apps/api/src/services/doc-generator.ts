/**
 * Document Generator — converts LLM output to DOCX, XLSX, or PDF.
 *
 * - DOCX: Markdown → structured Word document via `docx` library
 * - XLSX: JSON data → formatted Excel spreadsheet via `exceljs`
 * - PDF:  Markdown → PDF via `pdfkit`
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ExternalHyperlink,
} from 'docx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { storeFile } from './file-store.js';
import { createNotebookFile } from './db.js';

// ─── Types ───

export interface GenerateDocResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  conversationId: string;
}

// ─── Markdown Parser Helpers ───

interface MdBlock {
  type: 'heading' | 'paragraph' | 'list' | 'code' | 'table' | 'blockquote';
  level?: number;          // heading level
  content?: string;        // text content
  items?: string[];        // list items
  ordered?: boolean;       // ordered list?
  rows?: string[][];       // table rows (first row = header)
  lang?: string;           // code language
}

function parseMarkdownBlocks(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang });
      continue;
    }

    // Table (| header | header |)
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
        // Skip separator rows (| --- | --- |)
        if (!cells.every(c => /^[-:\s]+$/.test(c))) {
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        blocks.push({ type: 'table', rows: tableRows });
      }
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, content: stripInlineMarkdown(headingMatch[2]) });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    // List (unordered or ordered)
    if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\.\s/.test(line);
      while (i < lines.length && (/^\s*[-*]\s/.test(lines[i]) || /^\s*\d+\.\s/.test(lines[i]))) {
        items.push(stripInlineMarkdown(lines[i].replace(/^\s*[-*]\s|^\s*\d+\.\s/, '')));
        i++;
      }
      blocks.push({ type: 'list', items, ordered });
      continue;
    }

    // Empty line
    if (!line.trim()) { i++; continue; }

    // Paragraph — collect consecutive non-empty lines
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('> ') && !(lines[i].includes('|') && lines[i].trim().startsWith('|')) && !/^\s*[-*]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join(' ') });
    }
  }

  return blocks;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function parseInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Split on bold, italic, code, links
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), size: 22 }));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true, size: 22 }));
    } else if (token.startsWith('*')) {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true, size: 22 }));
    } else if (token.startsWith('`')) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Courier New', size: 20, color: '2E7D32' }));
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        runs.push(new TextRun({ text: linkMatch[1], color: '1976D2', underline: {}, size: 22 }));
      }
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), size: 22 }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 22 }));
  }

  return runs;
}

// ─── DOCX Generator ───

export async function generateDocx(
  title: string,
  markdown: string,
  userId: string,
  conversationId: string,
): Promise<GenerateDocResult> {
  const blocks = parseMarkdownBlocks(markdown);
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 36, color: '1B5E20' })],
    heading: HeadingLevel.TITLE,
    spacing: { after: 200 },
  }));

  // Subtitle
  children.push(new Paragraph({
    children: [new TextRun({ text: `Generated by minai.work`, size: 18, color: '999999', italics: true })],
    spacing: { after: 400 },
  }));

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const level = block.level === 1 ? HeadingLevel.HEADING_1
          : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
        children.push(new Paragraph({
          children: [new TextRun({ text: block.content ?? '', bold: true, size: block.level === 1 ? 32 : block.level === 2 ? 28 : 24 })],
          heading: level,
          spacing: { before: 240, after: 120 },
        }));
        break;
      }

      case 'paragraph':
        children.push(new Paragraph({
          children: parseInlineRuns(block.content ?? ''),
          spacing: { after: 160 },
        }));
        break;

      case 'list':
        for (const item of block.items ?? []) {
          children.push(new Paragraph({
            children: parseInlineRuns(item),
            bullet: block.ordered ? undefined : { level: 0 },
            numbering: block.ordered ? { reference: 'default-numbering', level: 0 } : undefined,
            spacing: { after: 60 },
          }));
        }
        break;

      case 'code':
        children.push(new Paragraph({
          children: [new TextRun({
            text: block.content ?? '',
            font: 'Courier New',
            size: 18,
            color: '333333',
          })],
          shading: { type: 'clear' as never, fill: 'F5F5F5', color: 'auto' },
          spacing: { before: 120, after: 120 },
        }));
        break;

      case 'blockquote':
        children.push(new Paragraph({
          children: parseInlineRuns(block.content ?? ''),
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: '4CAF50' } },
          spacing: { before: 120, after: 120 },
        }));
        break;

      case 'table': {
        const rows = block.rows ?? [];
        if (rows.length === 0) break;

        const tableRows = rows.map((row, rowIndex) =>
          new TableRow({
            children: row.map(cell =>
              new TableCell({
                children: [new Paragraph({
                  children: parseInlineRuns(cell),
                  spacing: { before: 40, after: 40 },
                })],
                shading: rowIndex === 0 ? { type: 'clear' as never, fill: 'E8F5E9', color: 'auto' } : undefined,
                width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
              })
            ),
          })
        );

        children.push(new Table({
          rows: tableRows,
          width: { size: 9000, type: WidthType.DXA },
        }));
        children.push(new Paragraph({ spacing: { after: 160 } }));
        break;
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level: 0,
          format: 'decimal' as never,
          text: '%1.',
          alignment: AlignmentType.START,
        }],
      }],
    },
  });

  const buffer = Buffer.from(await Packer.toBuffer(doc));
  const fileName = `${slugify(title)}.docx`;
  const { storagePath } = await storeFile(userId, buffer, fileName);
  const file = await createNotebookFile(conversationId, userId, fileName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer.length, storagePath);

  console.log(`[DocGen] DOCX created: ${fileName} (${buffer.length} bytes)`);
  return { fileId: file.id, fileName, mimeType: file.mime_type, fileSize: buffer.length, conversationId };
}

// ─── XLSX Generator ───

export async function generateXlsx(
  title: string,
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[],
  userId: string,
  conversationId: string,
): Promise<GenerateDocResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'minai.work';
  workbook.created = new Date();

  for (const sheetData of sheets) {
    // Excel sheet name: max 31 chars, no special chars
    const sheetName = sheetData.name.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || 'Sheet';
    const sheet = workbook.addWorksheet(sheetName);

    // Header row
    const headerRow = sheet.addRow(sheetData.headers);
    headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Data rows
    for (const row of sheetData.rows) {
      const excelRow = sheet.addRow(row);
      excelRow.font = { size: 11 };
    }

    // Auto-width columns
    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > maxLen) maxLen = Math.min(len, 50);
      });
      col.width = maxLen + 2;
    });

    // Alternating row colors
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      }
    });

    // Borders
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        };
      });
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileName = `${slugify(title)}.xlsx`;
  const { storagePath } = await storeFile(userId, buffer, fileName);
  const file = await createNotebookFile(conversationId, userId, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer.length, storagePath);

  console.log(`[DocGen] XLSX created: ${fileName} (${sheets.length} sheets, ${buffer.length} bytes)`);
  return { fileId: file.id, fileName, mimeType: file.mime_type, fileSize: buffer.length, conversationId };
}

// ─── PDF Generator ───

export async function generatePdf(
  title: string,
  markdown: string,
  userId: string,
  conversationId: string,
): Promise<GenerateDocResult> {
  const blocks = parseMarkdownBlocks(markdown);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: {
        Title: title,
        Author: 'minai.work',
        Creator: 'minai.work',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const fileName = `${slugify(title)}.pdf`;
        const { storagePath } = await storeFile(userId, buffer, fileName);
        const file = await createNotebookFile(conversationId, userId, fileName, 'application/pdf', buffer.length, storagePath);
        console.log(`[DocGen] PDF created: ${fileName} (${buffer.length} bytes)`);
        resolve({ fileId: file.id, fileName, mimeType: file.mime_type, fileSize: buffer.length, conversationId });
      } catch (err) {
        reject(err);
      }
    });
    doc.on('error', reject);

    // Title
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1B5E20').text(title, { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#999999').text('Generated by minai.work');
    doc.moveDown(1);

    for (const block of blocks) {
      const y = doc.y;
      if (y > 720) { doc.addPage(); }

      switch (block.type) {
        case 'heading':
          doc.moveDown(0.5);
          doc.fontSize(block.level === 1 ? 18 : block.level === 2 ? 15 : 13)
            .font('Helvetica-Bold').fillColor('#212121')
            .text(block.content ?? '');
          doc.moveDown(0.3);
          break;

        case 'paragraph':
          doc.fontSize(11).font('Helvetica').fillColor('#333333')
            .text(stripInlineMarkdown(block.content ?? ''), { lineGap: 3 });
          doc.moveDown(0.4);
          break;

        case 'list':
          for (const item of block.items ?? []) {
            const bullet = block.ordered
              ? `${(block.items?.indexOf(item) ?? 0) + 1}. `
              : '  \u2022  ';
            doc.fontSize(11).font('Helvetica').fillColor('#333333')
              .text(bullet + item, { indent: 20, lineGap: 2 });
          }
          doc.moveDown(0.3);
          break;

        case 'code':
          doc.moveDown(0.2);
          // Gray background box
          const codeText = block.content ?? '';
          doc.font('Courier').fontSize(9);
          const codeHeight = doc.heightOfString(codeText, { width: 460 }) + 16;
          doc.rect(doc.x, doc.y, 475, codeHeight).fill('#F5F5F5');
          doc.fontSize(9).font('Courier').fillColor('#333333')
            .text(codeText, doc.x + 8, doc.y + 8, { width: 460 });
          doc.moveDown(0.5);
          break;

        case 'blockquote':
          doc.moveDown(0.2);
          const savedX = doc.x;
          doc.rect(savedX, doc.y, 3, 14).fill('#4CAF50');
          doc.fontSize(11).font('Helvetica-Oblique').fillColor('#666666')
            .text(stripInlineMarkdown(block.content ?? ''), savedX + 12, doc.y, { lineGap: 2 });
          doc.moveDown(0.3);
          break;

        case 'table': {
          const rows = block.rows ?? [];
          if (rows.length === 0) break;
          const colCount = rows[0].length;
          const colWidth = Math.floor(475 / colCount);

          for (let r = 0; r < rows.length; r++) {
            if (doc.y > 720) doc.addPage();
            const rowY = doc.y;
            const isHeader = r === 0;

            if (isHeader) {
              doc.rect(doc.x, rowY, 475, 20).fill('#E8F5E9');
            }

            for (let c = 0; c < colCount; c++) {
              doc.fontSize(isHeader ? 10 : 10)
                .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
                .fillColor('#333333')
                .text(
                  stripInlineMarkdown(rows[r][c] ?? ''),
                  doc.page.margins.left + c * colWidth + 4,
                  rowY + 4,
                  { width: colWidth - 8, height: 16, ellipsis: true }
                );
            }
            doc.y = rowY + 20;
          }
          doc.moveDown(0.5);
          break;
        }
      }
    }

    doc.end();
  });
}

// ─── Helpers ───

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '') || 'document';
}

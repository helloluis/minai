/**
 * Generate the welcome PDF for new users.
 * Usage: node scripts/generate-welcome-pdf.mjs
 */

import PDFDocument from 'pdfkit';
import { createWriteStream, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '..', 'apps', 'api', 'src', 'assets', 'welcome.pdf');
const BG_IMAGE = join(__dirname, '..', 'apps', 'web', 'public', 'landing-page-bg.jpg');

import { mkdirSync } from 'fs';
mkdirSync(join(__dirname, '..', 'apps', 'api', 'src', 'assets'), { recursive: true });

const doc = new PDFDocument({
  size: 'LETTER',
  margin: 60,
  info: {
    Title: 'Welcome to minai',
    Author: 'minai',
  },
});

const stream = createWriteStream(OUTPUT);
doc.pipe(stream);

// Center the landing page image
const pageWidth = doc.page.width - 120; // margins
const imgHeight = 220;
doc.moveDown(2);
doc.image(BG_IMAGE, 60, doc.y, {
  width: pageWidth,
  height: imgHeight,
  fit: [pageWidth, imgHeight],
  align: 'center',
  valign: 'center',
});

doc.y += imgHeight + 30;

// Greeting text — centered, large serif
doc.font('Times-Roman')
  .fontSize(22)
  .fillColor('#16a34a')
  .text('Welcome to minai!', { align: 'center' });

doc.moveDown(1);

doc.font('Times-Roman')
  .fontSize(14)
  .fillColor('#333')
  .text(
    'Thanks for trying out minai! This is a sample file that you can view or delete any time you want.',
    { align: 'center', lineGap: 4 }
  );

doc.moveDown(0.5);

doc.text(
  'Please have a look around, try out various things, and let us know what you think!',
  { align: 'center', lineGap: 4 }
);

doc.moveDown(1.5);

doc.font('Times-Italic')
  .fontSize(12)
  .fillColor('#666')
  .text('minai — An AI Assistant for Human Assistants', { align: 'center' });

doc.moveDown(0.3);

doc.font('Times-Roman')
  .fontSize(11)
  .fillColor('#16a34a')
  .text('https://minai.work', { align: 'center', link: 'https://minai.work' });

doc.end();

stream.on('finish', () => {
  console.log(`✅ Welcome PDF generated: ${OUTPUT}`);
});

/**
 * Generate 69 sample term sheets from "Good Ventures" grants program
 * for fictional idea-stage startups from around the world.
 *
 * Usage: node scripts/generate-term-sheets.mjs
 */

import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'demo-files');
mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Data pools ──────────────────────────────────────────────────────────────

const countries = [
  { name: 'Philippines', cities: ['Manila', 'Cebu', 'Davao', 'Makati'] },
  { name: 'Kenya', cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Eldoret'] },
  { name: 'Nigeria', cities: ['Lagos', 'Abuja', 'Ibadan', 'Port Harcourt'] },
  { name: 'Indonesia', cities: ['Jakarta', 'Bandung', 'Surabaya', 'Yogyakarta'] },
  { name: 'India', cities: ['Mumbai', 'Bangalore', 'Delhi', 'Hyderabad'] },
  { name: 'Brazil', cities: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Recife'] },
  { name: 'Ghana', cities: ['Accra', 'Kumasi', 'Tamale', 'Cape Coast'] },
  { name: 'Vietnam', cities: ['Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Hue'] },
  { name: 'Colombia', cities: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla'] },
  { name: 'South Africa', cities: ['Cape Town', 'Johannesburg', 'Durban', 'Pretoria'] },
  { name: 'Mexico', cities: ['Mexico City', 'Guadalajara', 'Monterrey', 'Puebla'] },
  { name: 'Egypt', cities: ['Cairo', 'Alexandria', 'Giza', 'Luxor'] },
  { name: 'Bangladesh', cities: ['Dhaka', 'Chittagong', 'Sylhet', 'Rajshahi'] },
  { name: 'Tanzania', cities: ['Dar es Salaam', 'Dodoma', 'Arusha', 'Mwanza'] },
  { name: 'Thailand', cities: ['Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya'] },
  { name: 'Pakistan', cities: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi'] },
  { name: 'Rwanda', cities: ['Kigali', 'Butare', 'Gisenyi', 'Ruhengeri'] },
  { name: 'Peru', cities: ['Lima', 'Cusco', 'Arequipa', 'Trujillo'] },
];

const firstNames = [
  'Amara', 'Luis', 'Priya', 'Chen', 'Fatima', 'Diego', 'Ngozi', 'Raj',
  'Maria', 'Kofi', 'Aisha', 'Tomás', 'Linh', 'Emeka', 'Sakura', 'Omar',
  'Isabel', 'Kwame', 'Mei', 'Carlos', 'Zara', 'Juan', 'Nneka', 'Vikram',
  'Rosa', 'Tariq', 'Yuki', 'Pedro', 'Adele', 'Hassan', 'Lila', 'André',
  'Siti', 'Ravi', 'Grace', 'Mohammed', 'Claudia', 'Budi', 'Nadia', 'Felix',
  'Deepa', 'Samuel', 'Luz', 'Ibrahim', 'Anya', 'Jorge', 'Winnie', 'Arjun',
  'Beatriz', 'Daniel', 'Chidi', 'Thanh', 'Elena', 'Kwesi', 'Mika', 'Alejandro',
  'Folake', 'Suresh', 'Carmen', 'Abel', 'Hana', 'Mateo', 'Precious', 'Kiran',
  'Valentina', 'Joseph', 'Amina', 'Rafael', 'Joy',
];

const lastNames = [
  'Santos', 'Okafor', 'Patel', 'Nguyen', 'Mensah', 'Rodriguez', 'Kimura',
  'Al-Rashid', 'da Silva', 'Wanjiku', 'Suarez', 'Nakamura', 'Osei', 'Kumar',
  'Diallo', 'Torres', 'Nwankwo', 'Hernandez', 'Tran', 'Adjei', 'Gupta',
  'Lopez', 'Achebe', 'Sharma', 'Martinez', 'Owusu', 'Singh', 'Perez',
  'Bakare', 'Rahman', 'Garcia', 'Mbeki', 'Chandra', 'Flores', 'Nkomo',
  'Quispe', 'Tanaka', 'Morales', 'Abubakar', 'Reyes', 'Okonkwo', 'Dewi',
  'Castro', 'Otieno', 'Vargas', 'Mutua', 'Fernandez', 'Sato', 'Cruz',
  'Bautista', 'Espinoza', 'Ramos', 'Villanueva', 'Gutierrez', 'Jimenez',
  'Alvarez', 'Mendoza', 'Rojas', 'Aquino', 'Dela Cruz', 'Cortez',
  'Salazar', 'Montoya', 'Castillo', 'Navarro', 'Ibarra', 'Paredes',
  'Delgado', 'Pineda',
];

const sectors = [
  'AgriTech', 'FinTech', 'HealthTech', 'EdTech', 'CleanTech',
  'LogiTech', 'InsurTech', 'PropTech', 'FoodTech', 'GovTech',
  'RetailTech', 'LegalTech', 'HRTech', 'TravelTech', 'SocialTech',
];

const productPrefixes = [
  'Kasi', 'Sari', 'Duka', 'Pesa', 'Tani', 'Ruma', 'Seha', 'Shamba',
  'Gari', 'Maji', 'Soko', 'Boda', 'Jiko', 'Nuru', 'Watu', 'Hewa',
  'Zuri', 'Nyota', 'Bima', 'Fikra', 'Kazi', 'Mfuko', 'Habari', 'Umoja',
  'Rafiki', 'Amani', 'Ujuzi', 'Pamoja', 'Baraka', 'Tulia', 'Akili',
  'Riziki', 'Mazao', 'Huduma', 'Jamii',
];

const productSuffixes = [
  'Pay', 'Link', 'Hub', 'Flow', 'Track', 'Nest', 'Bridge', 'Pulse',
  'Spark', 'Wave', 'Path', 'Grid', 'Stack', 'Base', 'Loop', 'Sync',
  'Labs', 'Core', 'Edge', 'Cloud', 'AI', 'Go', 'Now', 'Up',
  'Shift', 'Box', 'Net', 'Wise', 'Swift', 'Plus', 'Pro', 'Dash',
  'Kit', 'Map', 'Tap',
];

const descriptions = [
  'mobile-first micro-lending platform for informal market vendors',
  'AI-powered crop disease detection using smartphone cameras',
  'peer-to-peer renewable energy trading marketplace',
  'blockchain-based land registry for rural communities',
  'telemedicine platform connecting rural clinics to specialists',
  'digital literacy training platform for underserved youth',
  'last-mile cold chain logistics for smallholder farmers',
  'mobile savings and group lending (chama/paluwagan) app',
  'waste-to-energy marketplace connecting collectors and recyclers',
  'insurance microproducts distributed via mobile money',
  'gig worker benefits platform with portable benefits tracking',
  'school fee payment and scholarship matching platform',
  'supply chain transparency tool for artisanal producers',
  'maternal health monitoring app with community health worker integration',
  'digital identity verification for financial inclusion',
  'affordable water quality monitoring IoT network',
  'real-time public transit tracking for informal transport',
  'community-owned solar microgrid management platform',
  'vocational training marketplace connecting employers and trainees',
  'mobile-first accounting tool for micro-enterprises',
  'crop price prediction and market access platform',
  'affordable diagnostic imaging analysis using AI',
  'digital cooperative management platform for farmer groups',
  'low-bandwidth e-commerce platform for rural markets',
  'refugee and migrant worker financial services platform',
  'school nutrition tracking and local food sourcing platform',
  'climate-resilient agriculture advisory via SMS and WhatsApp',
  'affordable housing finance and construction tracking platform',
  'community health data aggregation for local governments',
  'electric vehicle charging network for motorcycle taxis',
  'offline-first POS system for market traders',
  'mental health support chatbot in local languages',
  'fishery catch tracking and fair pricing platform',
  'digital notarization and legal document access platform',
  'cross-border remittance optimization using stablecoins',
];

const milestones = [
  'Complete MVP and onboard 100 pilot users',
  'Launch beta in 2 target markets with 500 users',
  'Achieve product-market fit with 1,000 active users',
  'Secure 3 institutional partnerships',
  'Process $50,000 in transaction volume',
  'Complete regulatory compliance in primary market',
  'Launch mobile app on Android and iOS',
  'Reach 2,500 registered users across 2 countries',
  'Demonstrate 20% month-over-month user growth',
  'Complete seed-stage fundraising round',
  'Establish operations in second country',
  'Achieve break-even on unit economics',
  'Onboard 50 merchant partners',
  'Complete data security audit and GDPR compliance',
  'Launch API integrations with 2 partner platforms',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function formatMoney(n) { return '$' + n.toLocaleString('en-US'); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function generateDate() {
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[month - 1]} ${day}, 2026`;
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

function generateTermSheet(index) {
  const country = pick(countries);
  const city = pick(country.cities);
  const firstName = firstNames[index % firstNames.length];
  const lastName = lastNames[index % lastNames.length];
  const founderName = `${firstName} ${lastName}`;
  const sector = pick(sectors);
  const productName = pick(productPrefixes) + pick(productSuffixes);
  const url = `www.${slugify(productName)}.${pick(['io', 'co', 'app', 'xyz', 'tech', 'org', 'africa', 'asia'])}`;
  const description = pick(descriptions);
  const grantAmount = pick([10000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 75000, 80000, 100000]);
  const equityPct = grantAmount >= 75000 ? `${pick([2, 3, 4, 5])}%` : grantAmount >= 40000 ? `${pick([1, 2, 3])}%` : 'None (grant only)';
  const date = generateDate();
  const termMonths = pick([6, 12, 12, 12, 18, 18, 24]);
  const selectedMilestones = pickN(milestones, randInt(2, 4));
  const disbursement = grantAmount >= 50000
    ? `Two tranches: ${formatMoney(Math.floor(grantAmount * 0.6))} upon signing, ${formatMoney(Math.floor(grantAmount * 0.4))} upon milestone completion`
    : `Single disbursement upon signing`;
  const coFounder = Math.random() > 0.5 ? `${pick(firstNames)} ${pick(lastNames)}` : null;

  const filename = `${String(index + 1).padStart(2, '0')}-${slugify(productName)}-term-sheet.pdf`;
  const filepath = join(OUTPUT_DIR, filename);

  const doc = new PDFDocument({ margin: 60, size: 'LETTER' });
  const stream = createWriteStream(filepath);
  doc.pipe(stream);

  // Header
  doc.fontSize(10).fillColor('#666')
    .text('GOOD VENTURES GRANT PROGRAM', { align: 'center' })
    .text('Empowering Builders in Emerging Economies', { align: 'center' })
    .moveDown(0.5);

  doc.moveTo(60, doc.y).lineTo(552, doc.y).stroke('#16a34a');
  doc.moveDown(1);

  // Title
  doc.fontSize(18).fillColor('#111')
    .text('TERM SHEET', { align: 'center' })
    .moveDown(0.3);

  doc.fontSize(11).fillColor('#444')
    .text(`Grant Agreement for ${productName}`, { align: 'center' })
    .moveDown(1.5);

  // Date
  doc.fontSize(10).fillColor('#666')
    .text(`Date: ${date}`, { align: 'right' })
    .moveDown(1);

  // Parties
  section(doc, 'PARTIES');
  doc.fontSize(10).fillColor('#333');
  doc.text(`Grantor: Good Ventures Foundation ("Good Ventures")`, { indent: 20 });
  doc.text(`123 Innovation Drive, San Francisco, CA 94105`, { indent: 20 });
  doc.moveDown(0.5);
  doc.text(`Grantee: ${productName} ("the Company")`, { indent: 20 });
  doc.text(`Founded by ${founderName}${coFounder ? ` and ${coFounder}` : ''}`, { indent: 20 });
  doc.text(`${city}, ${country.name}`, { indent: 20 });
  doc.text(`${url}`, { indent: 20 });
  doc.moveDown(1);

  // Company Overview
  section(doc, 'COMPANY OVERVIEW');
  doc.fontSize(10).fillColor('#333');
  doc.text(`Product: ${productName} — ${description}`, { indent: 20 });
  doc.text(`Sector: ${sector}`, { indent: 20 });
  doc.text(`Target Market: ${country.name} (primary), with expansion potential`, { indent: 20 });
  doc.text(`Stage: Idea / Pre-seed`, { indent: 20 });
  doc.moveDown(1);

  // Grant Terms
  section(doc, 'GRANT TERMS');
  doc.fontSize(10).fillColor('#333');
  doc.text(`Grant Amount: ${formatMoney(grantAmount)} USD`, { indent: 20 });
  doc.text(`Equity Consideration: ${equityPct}`, { indent: 20 });
  doc.text(`Term: ${termMonths} months from date of signing`, { indent: 20 });
  doc.text(`Disbursement: ${disbursement}`, { indent: 20 });
  doc.moveDown(1);

  // Milestones
  section(doc, 'KEY MILESTONES');
  doc.fontSize(10).fillColor('#333');
  selectedMilestones.forEach((m, i) => {
    doc.text(`${i + 1}. ${m}`, { indent: 20 });
  });
  doc.moveDown(1);

  // Reporting
  section(doc, 'REPORTING REQUIREMENTS');
  doc.fontSize(10).fillColor('#333');
  doc.text(`• Monthly progress reports submitted via the Good Ventures portal`, { indent: 20 });
  doc.text(`• Quarterly financial statements (income, expenses, runway)`, { indent: 20 });
  doc.text(`• Milestone completion evidence with supporting documentation`, { indent: 20 });
  doc.text(`• Final impact report at the end of the grant term`, { indent: 20 });
  doc.moveDown(1);

  // Conditions
  section(doc, 'CONDITIONS');
  doc.fontSize(10).fillColor('#333');
  doc.text(`• Funds must be used exclusively for the development and growth of ${productName}`, { indent: 20 });
  doc.text(`• The Company must maintain operations in ${country.name} for the duration of the grant`, { indent: 20 });
  doc.text(`• Good Ventures reserves the right to request an audit of grant expenditures`, { indent: 20 });
  doc.text(`• The Company must acknowledge Good Ventures support in public communications`, { indent: 20 });
  if (equityPct !== 'None (grant only)') {
    doc.text(`• Equity stake of ${equityPct} in the form of a SAFE (Simple Agreement for Future Equity)`, { indent: 20 });
  }
  doc.moveDown(1.5);

  // Signatures
  doc.moveTo(60, doc.y).lineTo(552, doc.y).stroke('#ddd');
  doc.moveDown(1);

  doc.fontSize(10).fillColor('#333');
  doc.text('ACCEPTED AND AGREED:', { underline: true });
  doc.moveDown(1.5);

  doc.text('_________________________________', { continued: false });
  doc.text(`${founderName}, Founder & CEO`, { indent: 0 });
  doc.text(productName);
  doc.moveDown(1.5);

  doc.text('_________________________________', { continued: false });
  doc.text('Sarah Chen, Director of Grants');
  doc.text('Good Ventures Foundation');
  doc.moveDown(1);

  // Footer
  doc.fontSize(8).fillColor('#999')
    .text(`Good Ventures Foundation — Confidential — ${filename}`, { align: 'center' });

  doc.end();

  return new Promise((resolve) => {
    stream.on('finish', () => {
      console.log(`  ✓ ${filename} — ${productName} (${founderName}, ${city}, ${country.name}) ${formatMoney(grantAmount)}`);
      resolve({ filename, productName, founderName, city, country: country.name, grantAmount, sector });
    });
  });
}

function section(doc, title) {
  doc.fontSize(11).fillColor('#16a34a').text(title, { underline: false });
  doc.moveDown(0.3);
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`Generating 69 term sheets in ${OUTPUT_DIR}...\n`);

const results = [];
for (let i = 0; i < 69; i++) {
  results.push(await generateTermSheet(i));
}

console.log(`\n✅ Done! ${results.length} term sheets generated.`);
console.log(`\nSummary:`);
console.log(`  Total grant value: ${formatMoney(results.reduce((s, r) => s + r.grantAmount, 0))}`);
console.log(`  Countries: ${[...new Set(results.map(r => r.country))].length}`);
console.log(`  Sectors: ${[...new Set(results.map(r => r.sector))].length}`);
console.log(`  Average grant: ${formatMoney(Math.round(results.reduce((s, r) => s + r.grantAmount, 0) / results.length))}`);

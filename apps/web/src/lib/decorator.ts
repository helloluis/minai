// Inline pattern detection and coloring — ported from beaniebot's acronymColors.ts
// Highlights acronyms, prices, times, dates, and locations with unique pastel colors.
// Skips content inside <code> and <pre> blocks.

// === Acronyms ===
// Matches: BTC, ERC721, BIP24, $DOT, $CELO
const ACRONYM_REGEX = /(?:\$[A-Z]{2,}|\b[A-Z]{2,}[0-9]*)\b/g;

// djb2 hash — fast, good distribution
function hashAcronym(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Generate a pastel color from the acronym string.
// Skips yellow/amber hues (35°–65°) to stay distinct from bold/italic formatting.
function getAcronymColor(acronym: string): string {
  const hash = hashAcronym(acronym);
  // Available hue range: 0–35 + 65–360 = 330 degrees
  let hue = hash % 330;
  if (hue > 35) hue += 30;
  return `hsl(${hue}, 65%, 75%)`;
}

// === Category colors — visually distinct from hash-based acronym colors ===
const PRICE_COLOR = "hsl(45, 70%, 72%)";        // gold
const TIME_COLOR = "hsl(175, 55%, 70%)";         // teal
const DATE_COLOR = "hsl(270, 50%, 75%)";         // lavender
const LOCATION_COLOR = "hsl(145, 45%, 68%)";     // sage green

// === Price patterns ===
// Matches: "$1,234.56", "$0.10", "0.05 USD", "KES 500", "₦2,000"
const PRICE_REGEX = /(?:\$\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:USD|KES|NGN|USDT|USDC|cUSD)|[₦₿]\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\b/g;

// === Time patterns ===
// Matches: "3:30 PM", "7am", "12:00 AM"
const TIME_REGEX = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM|a\.m\.|p\.m\.)\b/g;

// === Date patterns ===
const MONTHS_FULL = "January|February|March|April|May|June|July|August|September|October|November|December";
const MONTHS_SHORT = "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const MONTHS_ALL = `${MONTHS_FULL}|${MONTHS_SHORT}`;
// "March 1", "April 13, 2026", "12 April 1981", "Sept 24"
const DATE_REGEX = new RegExp(
  `\\b(?:(?:${MONTHS_ALL})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS_ALL})(?:\\s+\\d{4})?)\\b`,
  "gi"
);

// === Location names (target markets — Kenya, Nigeria, broader Africa) ===
const LOCATION_NAMES = [
  "Nairobi",
  "Mombasa",
  "Kisumu",
  "Nakuru",
  "Eldoret",
  "Lagos",
  "Abuja",
  "Kano",
  "Ibadan",
  "Port Harcourt",
  "Accra",
  "Dar es Salaam",
  "Kampala",
  "Johannesburg",
  "Cape Town",
  "Kenya",
  "Nigeria",
  "Ghana",
  "Tanzania",
  "Uganda",
  "South Africa",
  "Philippines",
  "Manila",
  "Jakarta",
  "São Paulo",
  "Mexico City",
];

const LOCATION_REGEX = new RegExp(
  `\\b(?:${LOCATION_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "gi"
);

// === Unified match type ===
type InlineMatch = {
  index: number;
  length: number;
  text: string;
  color: string;
  bold: boolean;
};

// Find all pattern matches, sorted by position, no overlaps.
function findPatternMatches(text: string): InlineMatch[] {
  const matches: InlineMatch[] = [];
  let m: RegExpExecArray | null;

  // Prices (bold + gold)
  PRICE_REGEX.lastIndex = 0;
  while ((m = PRICE_REGEX.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, text: m[0], color: PRICE_COLOR, bold: true });
  }

  // Acronyms (bold + hash-colored)
  ACRONYM_REGEX.lastIndex = 0;
  while ((m = ACRONYM_REGEX.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, text: m[0], color: getAcronymColor(m[0]), bold: true });
  }

  // Times
  TIME_REGEX.lastIndex = 0;
  while ((m = TIME_REGEX.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, text: m[0], color: TIME_COLOR, bold: false });
  }

  // Dates
  DATE_REGEX.lastIndex = 0;
  while ((m = DATE_REGEX.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, text: m[0], color: DATE_COLOR, bold: false });
  }

  // Locations
  LOCATION_REGEX.lastIndex = 0;
  while ((m = LOCATION_REGEX.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, text: m[0], color: LOCATION_COLOR, bold: false });
  }

  // Sort by position, prefer longer match at same position
  matches.sort((a, b) => a.index - b.index || b.length - a.length);

  // Remove overlapping matches (keep first/longer)
  const filtered: InlineMatch[] = [];
  let lastEnd = 0;
  for (const match of matches) {
    if (match.index >= lastEnd) {
      filtered.push(match);
      lastEnd = match.index + match.length;
    }
  }

  return filtered;
}

// Apply matches to a text string, producing HTML with <span> tags
function applyHighlights(text: string, matches: InlineMatch[]): string {
  if (matches.length === 0) return text;

  let result = "";
  let cursor = 0;
  for (const match of matches) {
    result += text.slice(cursor, match.index);
    const style = match.bold
      ? `color:${match.color};font-weight:600`
      : `color:${match.color}`;
    result += `<span style="${style}">${match.text}</span>`;
    cursor = match.index + match.length;
  }
  result += text.slice(cursor);
  return result;
}

// Post-process an HTML string to wrap inline patterns in colored <span> tags.
// Skips content inside <code>, <pre>, and HTML tags/attributes.
export function decorateHtml(html: string): string {
  const TAG_REGEX = /(<\/?[a-zA-Z][^>]*>)/g;
  const parts = html.split(TAG_REGEX);
  let insideCode = 0; // nesting depth

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.startsWith("<")) {
      // Track code/pre nesting
      const isClosing = part.startsWith("</");
      const tagName = (part.match(isClosing ? /^<\/([a-zA-Z]+)/ : /^<([a-zA-Z]+)/) || [])[1]?.toLowerCase();
      if (tagName === "code" || tagName === "pre") {
        insideCode += isClosing ? -1 : 1;
      }
      continue;
    }

    // Skip text inside code/pre
    if (insideCode > 0) continue;

    // Find and apply all pattern highlights
    const matches = findPatternMatches(part);
    parts[i] = applyHighlights(part, matches);
  }

  return parts.join("");
}

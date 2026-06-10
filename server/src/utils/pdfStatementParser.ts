import { categorizeTransaction } from "./categorization";

export interface ParsedTransaction {
  postedDate: string;        // YYYY-MM-DD
  descriptionRaw: string;
  descriptionClean: string;
  amount: number;            // always positive
  type: "income" | "expense";
  category: string;
  piiScrubbed: true;
}

export interface StatementParseResult {
  institutionGuess: string;
  statementType: "bank" | "credit-card" | "unknown";
  accountTypeHint: string | null;   // granular: "chequing", "savings", "tfsa", "line-of-credit", etc.
  accountMask: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  transactions: ParsedTransaction[];
  warnings: string[];
}

// ── PII scrubbing ─────────────────────────────────────────────────────────────

function scrubPII(text: string): string {
  return text
    .replace(/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, "****")
    .replace(/\b\d{12,19}\b/g, "****")
    .replace(/\b\d{9}\b/g, "****")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .trim();
}

// ── Amount helpers ────────────────────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[$,\s]/g, "")
    .replace(/^\((.+)\)$/, "-$1")   // (1,234.56) → -1234.56
    .trim();
  const n = parseFloat(cleaned);
  return isFinite(n) && n !== 0 ? Math.abs(n) : null;
}

// ── Direction classification ──────────────────────────────────────────────────
// Covers common Canadian banking keywords across all Big-6 banks + credit unions.

function classifyDirection(desc: string, typeHint: string): "income" | "expense" {
  const s = `${desc} ${typeHint}`.toLowerCase();

  // Explicit ledger markers override everything
  if (/\bdr\b/.test(s)) return "expense";
  if (/\bcr\b/.test(s)) return "income";

  // Expense keywords
  if (/\b(debit|purchase|withdrawal|bill\s*payment|pap|pre-?auth(?:orized)?|nsfee?|nsf\s+fee|service\s+charge|monthly\s+fee|annual\s+fee|bank\s+fee|interest\s+charged|cash\s+advance|atm|pos|transfer\s+out|e-?transfer\s+to|interac\s+e-?transfer\s+to|wire\s+out|wire\s+transfer\s+to|payment\s+(?:to|for|made))\b/i.test(s)) return "expense";

  // Income keywords
  if (/\b(deposit|payroll|direct\s*dep(?:osit)?|e-?transfer\s+(?:received|from)|emt\s+recv|interac\s+e-?transfer\s+from|transfer\s+in|wire\s+in|wire\s+transfer\s+from|refund|reversal|credit(?!\s*(?:card|limit|union))|interest\s+earned|int\.?\s*earned|cashback|cash\s*back|payment\s+received|payment\s+thank\s+you|thank\s+you\s+payment|salary|wages?|reimbursement|\breturn\b|cpp|oas|\bei\b|gst(?:\/hst)?\s*credit|hst\s+credit|ccb|ctb|government\s+(?:of\s+canada\s+)?deposit|cra\s+deposit)\b/i.test(s)) return "income";

  return "expense";
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  january: "01", february: "02", march: "03", april: "04", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function parseDate(raw: string, yearHint: number): string | null {
  const s = raw.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY  MM-DD-YYYY  MM/DD/YY
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }

  // Jan 05  /  January 5  /  Jan. 05  /  Jan 05, 2026
  const monDayMatch = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/);
  if (monDayMatch) {
    const m = MONTH_MAP[monDayMatch[1].toLowerCase()];
    if (m) {
      const year = monDayMatch[3] || String(yearHint);
      return `${year}-${m}-${monDayMatch[2].padStart(2, "0")}`;
    }
  }

  // 05 Jan  /  05-Jan  /  05-Jan-2026  /  05/Jan/2026
  const dayMonMatch = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})(?:[\s\-\/](\d{4}))?$/);
  if (dayMonMatch) {
    const m = MONTH_MAP[dayMonMatch[2].toLowerCase()];
    if (m) {
      const year = dayMonMatch[3] || String(yearHint);
      return `${year}-${m}-${dayMonMatch[1].padStart(2, "0")}`;
    }
  }

  // Jan02 — month abbreviation glued directly to day, no separator (TD statement format)
  const monDayGluedMatch = s.match(/^([A-Za-z]{3})(\d{2})$/);
  if (monDayGluedMatch) {
    const m = MONTH_MAP[monDayGluedMatch[1].toLowerCase()];
    if (m) {
      return `${yearHint}-${m}-${monDayGluedMatch[2]}`;
    }
  }

  return null;
}

// ── Text pre-processing ───────────────────────────────────────────────────────
// Normalize encoding artifacts that break regex matching.

function preprocessText(text: string): string {
  return text
    .replace(/\r\n|\r/g, "\n")          // normalize line endings
    .replace(/\t/g, "    ")             // tabs → 4 spaces (preserve rough alignment)
    .replace(/–|—/g, "-")     // en-dash / em-dash → hyphen
    .replace(/’|‘/g, "'")     // curly apostrophes
    .replace(/“|”/g, '"')     // curly quotes
    .replace(/ /g, " ")            // non-breaking space
    .replace(/−/g, "-");           // unicode minus
}

// ── Fragmented-text recovery ──────────────────────────────────────────────────
// Some bank statement PDFs (e.g. TD Canada Trust) render every word/number as a
// run of 1-3 character glyph clusters, each separated from the next by a single
// space that doesn't correspond to a real word or column boundary - e.g.
// "Descri pt i on" instead of "Description", "M A R0 4" instead of "MAR04".
// Detect this via a space-tolerant match against a known column header, then
// collapse every isolated single space (leaving genuine multi-space gaps
// intact) so dates, amounts and headers read as contiguous tokens again.
function buildFuzzyRegex(literal: string): RegExp {
  const pattern = literal
    .split("")
    .map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(" ?");
  return new RegExp(pattern, "i");
}

const TD_HEADER_FUZZY = buildFuzzyRegex("DescriptionWithdrawalsDepositsDateBalance");

function recoverFragmentedText(text: string): string {
  if (!TD_HEADER_FUZZY.test(text)) return text;
  return text.replace(/(?<! ) (?! )/g, "");
}

// ── Header extraction ─────────────────────────────────────────────────────────

function extractYear(text: string): number {
  // Prefer year from within the statement period dates
  const periodMatch = text.match(/(?:statement\s+period|period\s+covered|from)[:\s]+[^0-9]*(20\d{2})/i);
  if (periodMatch) return parseInt(periodMatch[1]);
  const m = text.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1]) : new Date().getFullYear();
}

function extractAccountMask(text: string): string | null {
  // Search the document header (first 3 000 chars) — account info always appears here.
  const header = text.slice(0, 3000);

  // ── Masked patterns — only last-4 digits available ──────────────────────────
  for (const pattern of [
    /\*{3,4}(\d{4})/,
    /\d{4}\s+[Xx]{4}\s+[Xx]{4}\s+(\d{4})/,  // CIBC CC: "4500 XXXX XXXX 5120"
    /[Xx]{3,4}\s*(\d{4})/,                    // X-masked
    /(?:account|card|acct)[\s#:]+\*+(\d{4})/i,
    /ending\s+in\s+(\d{4})/i,
    /no\.?\s*\*+(\d{4})/i,
  ]) {
    const m = header.match(pattern) ?? text.match(pattern);
    if (m) return `****${m[1]}`;
  }

  // ── Plain account number patterns — return full number ───────────────────────
  // Handles both spaced ("Account number 1234567") and concatenated ("AccountNumber:1234567")
  const plainPatterns: RegExp[] = [
    // "Account Number: X" / "Account No. X" / "AccountNumber:X" / "Acct#X"
    /(?:account|acct)\s*(?:number|no\.?|#)\s*[:\-]?\s*([\d][\d ]{4,20}\d)/i,
    // Transit + account (TD, CIBC, Scotiabank) — optional whitespace between segments
    /transit\s*(?:no\.?)?\s*[\d ]{4,7}[\s,]?\s*(?:account|acct)\s*(?:no\.?)?\s*([\d][\d ]{4,20}\d)/i,
    // Branch + account ("Branch 012 Account 1234567")
    /branch\s*(?:transit\s*)?(?:no\.?)?\s*[\d ]{4,7}[\s,]?\s*account\s*(?:no\.?)?\s*([\d][\d ]{4,20}\d)/i,
    // Dash-separated account numbers (RBC/BMO: "00102-1234567-5")
    /(?:account|acct)[\s.#:]+(?:no\.?\s*|number\s*)?(\d{2,6}[\-]\d{4,9}[\-]?\d{0,3})/i,
    // "Statement for account XXXXXXXX"
    /(?:statement|activity)\s+for\s+account[:\s]+([\d][\d ]{3,18}\d)/i,
    // "Customer/client account: XXXXXXXX"
    /(?:customer|client)\s+(?:account|no\.?)\s*[:\s]+([\d][\d ]{3,18}\d)/i,
    // Broad fallback: "account" + up to 40 non-newline chars (non-greedy) + 6-15 consecutive digits.
    // Catches concatenated formats and unusual layouts not covered above.
    /\baccount[^\n]{0,40}?(\d{6,15})/i,
  ];

  for (const pattern of plainPatterns) {
    const m = header.match(pattern);
    if (m) {
      const raw = m[1].trim();
      const digits = raw.replace(/[\s\-]/g, '');
      if (digits.length >= 4) return raw.replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

function detectAccountTypeHint(text: string): string | null {
  const lower = text.toLowerCase();
  // "Visa Debit" — allow any 0-6 chars between words to handle asterisks, symbols,
  // and concatenation artifacts from pdf-parse (e.g. "Visa* Debit", "VisaDebit").
  if (/visa.{0,6}debit/i.test(text))                       return "chequing";
  // Registered accounts
  if (/tfsa/i.test(text))                                  return "tfsa";
  if (/rrsp/i.test(text))                                  return "rrsp";
  if (/fhsa/i.test(text))                                  return "fhsa";
  if (/rrif/i.test(text))                                  return "investment";
  if (/resp/i.test(text))                                  return "investment";
  // Deposit accounts — no word boundaries; handles concatenated PDF text
  if (/chequing|checking/.test(lower))                     return "chequing";
  if (/savings.{0,4}account|hisa|high.{0,4}interest.{0,4}savings/.test(lower)) return "savings";
  if (/savings/.test(lower))                               return "savings";
  // Loan / credit products
  if (/line.{0,6}of.{0,6}credit|loc/.test(lower))         return "line-of-credit";
  if (/mortgage/.test(lower))                              return "mortgage";
  if (/student.{0,4}loan/.test(lower))                     return "student-loan";
  if (/auto.{0,4}loan|car.{0,4}loan/.test(lower))          return "auto-loan";
  if (/personal.{0,4}loan/.test(lower))                    return "personal-loan";
  // Credit card — only reached when no bank/debit keyword matched
  if (/credit.{0,4}card|carte.{0,4}de.{0,4}cr[eé]dit/.test(lower)) return "credit-card";
  if (/\bvisa\b|\bmastercard\b|\bamex\b|\bamerican.{0,4}express\b/.test(lower)) return "credit-card";
  return null;
}

function extractPeriod(text: string, yearHint: number): { from: string | null; to: string | null } {
  // Pattern 1: keyword-prefixed with "to" separator — handles "For Jan 1 to Jan 31, 2026"
  // \s* before "to" allows "January 27to February 25" (no space before "to")
  const p1 = text.match(
    /(?:statement\s+period|for|from|period)[:\s]+([A-Za-z0-9,\.\s\-\/]+?)\s*(?:to|through)\s+([A-Za-z0-9,\.\s\-\/]+)/i
  );
  if (p1) {
    const from = parseDate(p1[1].trim(), yearHint);
    const to   = parseDate(p1[2].trim(), yearHint);
    if (from && to) return { from, to };
  }

  // Pattern 2: bare month-day "to" without keyword — handles "January 27to February 25, 2026"
  const p2 = text.match(
    /\b([A-Za-z]{3,9}\.?\s+\d{1,2})\s*to\s+([A-Za-z]{3,9}\.?\s+\d{1,2}(?:[,\s]+\d{4})?)/i
  );
  if (p2) {
    const from = parseDate(p2[1].trim(), yearHint);
    const to   = parseDate(p2[2].trim(), yearHint);
    if (from && to) return { from, to };
  }

  // Pattern 3: dash separator — handles "Feb 1 - Feb 28, 2026" (en-dash normalized by preprocessText)
  const p3 = text.match(
    /\b([A-Za-z]{3,9}\.?\s+\d{1,2}(?:[,\s]+\d{4})?)\s+-\s+([A-Za-z]{3,9}\.?\s+\d{1,2}(?:[,\s]+\d{4})?)\b/
  );
  if (p3) {
    const from = parseDate(p3[1].trim(), yearHint);
    const to   = parseDate(p3[2].trim(), yearHint);
    if (from && to) return { from, to };
  }

  return { from: null, to: null };
}

function detectInstitution(text: string): string {
  const u = text.toUpperCase();
  if (u.includes("ROYAL BANK") || /\bRBC\b/.test(u)) return "RBC";
  if (u.includes("TD CANADA TRUST") || u.includes("TORONTO-DOMINION") || /\bTD BANK\b/.test(u)) return "TD";
  if (u.includes("SCOTIABANK") || u.includes("BANK OF NOVA SCOTIA")) return "Scotiabank";
  if (u.includes("BANK OF MONTREAL") || /\bBMO\b/.test(u)) return "BMO";
  if (u.includes("CIBC") || u.includes("CANADIAN IMPERIAL")) return "CIBC";
  if (u.includes("NATIONAL BANK") || u.includes("BANQUE NATIONALE")) return "National Bank";
  if (u.includes("DESJARDINS")) return "Desjardins";
  if (u.includes("TANGERINE")) return "Tangerine";
  if (u.includes("SIMPLII")) return "Simplii";
  if (u.includes("EQ BANK")) return "EQ Bank";
  if (u.includes("HSBC")) return "HSBC";
  if (u.includes("LAURENTIAN")) return "Laurentian Bank";
  if (u.includes("MANULIFE BANK")) return "Manulife Bank";
  if (u.includes("COAST CAPITAL")) return "Coast Capital";
  if (u.includes("ATB FINANCIAL") || u.includes("ALBERTA TREASURY BRANCHES")) return "ATB Financial";
  if (u.includes("MERIDIAN")) return "Meridian Credit Union";
  if (u.includes("FIRST WEST") || u.includes("ENVISION")) return "First West Credit Union";
  if (u.includes("MOTUSBANK")) return "Motusbank";
  if (u.includes("WEALTHSIMPLE")) return "Wealthsimple";
  if (u.includes("PCFINANCIAL") || u.includes("PC FINANCIAL") || u.includes("PC BANK")) return "PC Bank";
  return "Unknown";
}

function detectStatementType(text: string): "bank" | "credit-card" | "unknown" {
  const lower = text.toLowerCase();
  // "Visa Debit" (allow any 0-6 chars to handle concatenation/symbols) = bank, not credit card
  if (/visa.{0,6}debit/i.test(text)) return "bank";
  // Other bank keywords — no word boundaries to handle concatenated PDF text
  if (/chequing|checking|savings|deposit.{0,4}account|account.{0,4}statement|monthly.{0,4}statement|line.{0,6}of.{0,6}credit|mortgage/.test(lower)) return "bank";
  // Credit card — only when no bank keyword matched
  if (/credit.{0,4}card|carte.{0,4}de.{0,4}cr[eé]dit|card.{0,4}statement|amex|american.{0,4}express/.test(lower)) return "credit-card";
  if (/\bvisa\b|\bmastercard\b/.test(lower)) return "credit-card";
  return "unknown";
}

// ── Skip-line patterns ────────────────────────────────────────────────────────
// Lines matching this are never treated as transaction starts or continuations.

const SKIP_LINE_RE = /^(date\b|description\b|amount\b|balance\b|transaction(?:s)?\b|statement\b|account\s+(?:number|summary|activity|details|no\.?)\b|customer\s+(?:number|name|no\.?)\b|branch\s*(?:number|transit|no\.?)?\b|card\s+(?:number|no\.?)\b|page\s*\d|\d+\s+of\s+\d+|total\b|sub-?total\b|opening\s+balance|closing\s+balance|previous\s+balance|new\s+balance|brought\s+forward|carried\s+forward|balance\s+forward|forward\s+balance|credit\s+limit|available\s+credit|minimum\s+payment|payment\s+due\s+date|interest\s+rate|annual\s+percentage|total\s+(?:purchases|withdrawals|deposits|debits|credits|charges|payments)|withdrawals?\s*\(|deposits?\s*\(|[\*=\-]{3,}|\s*$)/i;

// Section headers that end a transaction block if seen as a continuation line
const SECTION_HEADER_RE = /^(account\s+(?:activity|summary)|transaction\s+(?:history|list|summary)|purchases?\s*$|payments?\s+and\s+credits?\s*$|cash\s+advances?\s*$|other\s+(?:fees|charges)\s*$|fees\s+and\s+interest\s*$|interest\s+charged\s*$)/i;

// ── Date anchor patterns (must appear at line start after trim) ───────────────

// Each pattern captures the date in group 1. The trailing (?:\s+|$) allows
// a date that occupies its own line (common in TD, CIBC column layouts).
const DATE_ANCHOR_RES = [
  /^(\d{4}-\d{2}-\d{2})(?:\s+|$)/,
  /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s+|$)/,
  /^([A-Za-z]{3,9}\.?\s+\d{1,2}(?:[,\s]+\d{4})?)(?:\s+|$)/,
  /^(\d{1,2}[\s\-][A-Za-z]{3,9}(?:[\s\-]\d{4})?)(?:\s+|$)/,
  // JanDD — month abbreviation glued directly to day, no separator (TD statement format)
  /^([A-Za-z]{3}(?:0[1-9]|[12]\d|3[01]))(?:\s+|$)/,
];

// ── Description cleanup ───────────────────────────────────────────────────────
// Strips a leading secondary date (credit card posting-date column).

function stripLeadingDate(desc: string): string {
  for (const re of DATE_ANCHOR_RES) {
    const m = desc.match(re);
    if (m) {
      const rest = desc.slice(m[0].length).trim();
      if (rest.length >= 3) return rest;
    }
  }
  return desc;
}

// ── Block-based generic parser ────────────────────────────────────────────────
//
// Canadian bank PDFs commonly wrap transaction rows across 2-4 lines when
// extracted as plain text. This block accumulator gathers all lines belonging
// to one transaction (anchored by a date) before parsing amounts/description.
//
// Layout variants handled:
//   1. Single-line:  "Jan 05  STARBUCKS TORONTO ON  10.50  9,876.54"
//   2. Amount on next line:  "Jan 05  AMAZON.CA\n  50.00  9,826.54"
//   3. Multi-line desc:  "Jan 05  CIBC REWARDS\n  VISA TORONTO ON  500.00  9,376.54"
//   4. Credit card two-date:  "Jan 05  Jan 07  STARBUCKS  10.50"
//   5. DR/CR suffix:  "05 Jan  RENT PAYMENT  1,200.00 DR  8,676.54"

const MAX_BLOCK_LINES = 5;

function parseGenericLines(text: string, yearHint: number): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const lines = text.split("\n");

  let blockDate: string | null = null;
  let blockLines: string[] = [];
  let blockDateConsumed = 0; // chars of blockLines[0] taken by the date

  const flushBlock = () => {
    if (!blockDate || blockLines.length === 0) { blockLines = []; blockDate = null; return; }

    // Reconstruct combined text: rest-of-first-line + continuation lines
    const firstRest = blockLines[0].slice(blockDateConsumed).trim();
    const contParts = blockLines.slice(1).map(l => l.trim()).filter(l => l.length > 0);
    const combined = [firstRest, ...contParts].join(" ").replace(/\s{2,}/g, " ").trim();

    // Find all dollar amounts in combined text (right to left by occurrence)
    const AMT_RE = /(\(?\$?[\d,]+\.\d{2}\)?)\s*(CR|DR)?/gi;
    const amtMatches = [...combined.matchAll(AMT_RE)];

    if (amtMatches.length === 0) { blockLines = []; blockDate = null; return; }

    // If ≥ 2 amounts: second-to-last = transaction, last = running balance.
    // If only 1 amount: it's the transaction amount.
    const txnIdx = amtMatches.length >= 2 ? amtMatches.length - 2 : 0;
    const txnMatch = amtMatches[txnIdx];
    const hint = (txnMatch[2] || amtMatches[amtMatches.length - 1][2] || "").toUpperCase();

    const amount = parseAmount(txnMatch[1]);
    if (!amount) { blockLines = []; blockDate = null; return; }

    // Description = combined text with all amount tokens removed.
    // This handles layouts where amounts appear before the merchant name
    // (e.g. TD: "Jan 05  150.00  9,726.54\nROGERS BILL PAYMENT").
    let descRaw = combined
      .replace(/\(?\$?[\d,]+\.\d{2}\)?\s*(?:CR|DR)?/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!descRaw || descRaw.length < 3) { blockLines = []; blockDate = null; return; }

    // Strip secondary date (credit card posting-date column)
    descRaw = stripLeadingDate(descRaw);
    if (!descRaw || descRaw.length < 3) { blockLines = []; blockDate = null; return; }

    // Skip lines that look like totals masquerading as transactions
    if (/^(total|sub.?total|balance|minimum|interest|fee|charge)\b/i.test(descRaw)) {
      blockLines = []; blockDate = null; return;
    }

    const type = classifyDirection(descRaw, hint);
    const descClean = scrubPII(descRaw);

    results.push({
      postedDate:       blockDate,
      descriptionRaw:   descRaw,
      descriptionClean: descClean,
      amount,
      type,
      category: categorizeTransaction(descClean),
      piiScrubbed: true,
    });

    blockLines = []; blockDate = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Empty line = hard block boundary
    if (!trimmed) { flushBlock(); continue; }

    // Very short lines are noise
    if (trimmed.length < 4) continue;

    // Try date anchor at line start
    let foundDate: string | null = null;
    let foundLen = 0;
    for (const re of DATE_ANCHOR_RES) {
      const m = trimmed.match(re);
      if (m) {
        const parsed = parseDate(m[1], yearHint);
        if (parsed) { foundDate = parsed; foundLen = m[0].length; break; }
      }
    }

    if (foundDate) {
      flushBlock();
      blockDate = foundDate;
      blockLines = [trimmed];
      blockDateConsumed = foundLen;
      continue;
    }

    // No date anchor — handle as potential continuation
    if (blockDate === null) continue; // outside any block, skip

    // End block if this looks like a non-transaction line
    if (SKIP_LINE_RE.test(trimmed) || SECTION_HEADER_RE.test(trimmed)) {
      flushBlock();
      continue;
    }

    if (blockLines.length < MAX_BLOCK_LINES) {
      blockLines.push(trimmed);
    } else {
      // Too many continuation lines — this block is probably junk
      flushBlock();
    }
  }
  flushBlock();

  return results;
}

// ── TD concatenated-column parser ─────────────────────────────────────────────
//
// TD e-statements from EasyWeb extract with all table columns run together
// and no spaces between fields. Each transaction line looks like:
//   DESCRIPTION[AMOUNT][MON][DD][BALANCE?]
//
// Date is always an uppercase 3-letter month + 2-digit day (e.g. JAN02).
// Amount immediately precedes the date. Running balance may follow the date.
// Statement period uses 2-digit years: DEC31/25-JAN30/26
//
// Amount pattern uses ≤4 digits before decimal to avoid matching embedded
// account-reference numbers (which are typically 7+ digits).

function isTDConcatenatedFormat(text: string): boolean {
  // Distinctive column header — column names are normally concatenated with
  // no spaces, but allow optional whitespace in case layout reconstruction
  // leaves a stray space at a column boundary.
  return /Description\s*Withdrawals\s*Deposits\s*Date\s*Balance/i.test(text);
}

function parseTDConcatenated(text: string): ParsedTransaction[] {
  // ── Year resolution for 2-digit period dates (e.g. DEC31/25-JAN30/26) ──
  const periodRe = /([A-Z]{3})(\d{2})\/(\d{2})-([A-Z]{3})(\d{2})\/(\d{2})/;
  const periodMatch = text.match(periodRe);
  let fromMonthNum = 1, fromYear = new Date().getFullYear();
  let toMonthNum   = 12, toYear = fromYear;
  if (periodMatch) {
    fromMonthNum = parseInt(MONTH_MAP[periodMatch[1].toLowerCase()] || "1");
    fromYear     = 2000 + parseInt(periodMatch[3]);
    toMonthNum   = parseInt(MONTH_MAP[periodMatch[4].toLowerCase()] || "12");
    toYear       = 2000 + parseInt(periodMatch[6]);
  }
  const getYear = (monthNum: number): number => {
    if (fromYear === toYear) return fromYear;
    return monthNum >= fromMonthNum ? fromYear : toYear;
  };

  // ── Skip-line patterns for TD page furniture ──
  const SKIP_RE = /^(Description|Balance|Starting|Openingbalance|Balanceforward|Closingbalance|Account|Transaction|Statement|Branch|Page|Selfserve|Fullserve|Minimum\$|Feeswaivedfeespaid|Accountissuedby|Foryour|Youraccountcan|Avoidchoosing|Memorizeyour|Neverrecord|Tel:|TTY:|1-8[06]|www\.|4,|3,|2,|1,)/i;

  // Conservative amount: ≤4 digits before decimal avoids matching 7-digit account refs.
  // Allow an optional stray space around the decimal/thousands separators in case a
  // column-boundary gap landed inside a number.
  const AMT_RE = /\d{1,4}(?:\s?,\s?\d{3})*\s?\.\s?\d{2}/g;
  // TD embedded date: uppercase MON + 2-digit day, with an optional stray space between them
  const DATE_RE = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s?(\d{2})/g;

  const results: ParsedTransaction[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.length < 6) continue;
    if (SKIP_RE.test(line)) continue;

    // Collect all embedded dates in this line
    DATE_RE.lastIndex = 0;
    const dateMatches: RegExpExecArray[] = [];
    let dm: RegExpExecArray | null;
    while ((dm = DATE_RE.exec(line)) !== null) dateMatches.push(dm);
    if (dateMatches.length === 0) continue;

    // Use the LAST date occurrence as posting date (handles "JAN03IDPPURREV…JAN14" edge case)
    const lastDate   = dateMatches[dateMatches.length - 1];
    const dateStart  = lastDate.index;
    const dateEnd    = dateStart + lastDate[0].length; // "JAN02" = 5 chars (or 6 with a stray space)

    const monthStr   = lastDate[1].toLowerCase();
    const monthPad   = MONTH_MAP[monthStr] || "01";
    const monthNum   = parseInt(monthPad);
    const day        = lastDate[2];
    const year       = getYear(monthNum);
    const postedDate = `${year}-${monthPad}-${day}`;

    // Text before the date contains description + transaction amount
    const beforeDate = line.slice(0, dateStart);

    // Find all amounts in beforeDate
    AMT_RE.lastIndex = 0;
    const amtMatches: RegExpExecArray[] = [];
    let am: RegExpExecArray | null;
    while ((am = AMT_RE.exec(beforeDate)) !== null) amtMatches.push(am);
    if (amtMatches.length === 0) continue;

    // Transaction amount = the LAST amount immediately before the date
    const rawMatch = amtMatches[amtMatches.length - 1];
    let rawAmtStr  = rawMatch[0];
    let txnAmtIdx  = rawMatch.index;

    // Sanity check: TD refs ending in a digit bleed into the amount (e.g. "rG3" + "1,026.00").
    // While the parsed amount exceeds $9,999 (unlikely for a single e-transfer), strip
    // the leading digit(s) that came from the reference until the value is plausible.
    let amount = parseFloat(rawAmtStr.replace(/[\s,]/g, ""));
    while (amount > 9999.99) {
      const firstChar = rawAmtStr.match(/^(\d,?)/);
      if (!firstChar) break;
      const stripped = rawAmtStr.slice(firstChar[1].length);
      const newAmt   = parseFloat(stripped.replace(/[\s,]/g, ""));
      if (!isFinite(newAmt) || newAmt <= 0) break;
      txnAmtIdx += firstChar[1].length;
      rawAmtStr  = stripped;
      amount     = newAmt;
    }

    if (!isFinite(amount) || amount <= 0) continue;

    // Description = everything before the transaction amount, cleaned
    let descRaw = beforeDate.slice(0, txnAmtIdx)
      .replace(/_[A-Z]$/i, "")  // strip TD type suffix (_V = Visa, _F = fee type)
      .replace(/\s+/g, " ")
      .trim();
    if (!descRaw || descRaw.length < 2) continue;

    // Strip a leading embedded date (e.g. "JAN03" from "JAN03IDPPURREV…")
    descRaw = descRaw.replace(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s?\d{2}/i, "").trim();
    if (!descRaw || descRaw.length < 2) continue;

    // Skip known summary lines that survived the first filter
    if (/^(STARTING|OPENING|CLOSING|BALANCEF|TOTALWITH|TOTALDEPOSIT)/i.test(descRaw)) continue;

    const type = classifyDirectionTD(descRaw);
    const descClean = scrubPII(descRaw);

    results.push({
      postedDate, descriptionRaw: descRaw, descriptionClean: descClean,
      amount, type, category: categorizeTransaction(descClean), piiScrubbed: true,
    });
  }

  return results;
}

// TD-specific direction classifier — handles the compact no-space description codes
function classifyDirectionTD(desc: string): "income" | "expense" {
  const s = desc.toUpperCase();
  // Income signals
  if (/TFR-FR|TFRFR/.test(s))                     return "income"; // transfer FROM
  if (/^E-TRANSFER|^E-TFR/.test(s))               return "income"; // incoming (no SEND prefix)
  if (/CPAY|C\.PAY/.test(s))                      return "income"; // government benefit pay
  if (/LNPYMT-C/.test(s))                         return "income"; // loan payment reversal
  if (/DEPOSIT|PAYROLL|DIRECTDEP/.test(s))         return "income";
  // Expense signals
  if (/^SEND|SENDE-TFR/.test(s))                  return "expense"; // send e-transfer out
  if (/TFR-TO|TFRTO/.test(s))                     return "expense"; // transfer TO
  if (/^LNPYMT|^LNRTNFEE/.test(s))               return "expense"; // loan payment / fee
  // Fall back to the general classifier
  return classifyDirection(desc, "");
}

// ── CIBC Credit Card (Visa) parser ───────────────────────────────────────────
// CIBC Visa PDFs use a two-date prefix per transaction line:
//   (Trans Mon DD)(Post Mon DD)(Description)(SpendCategory)(Amount)
// All columns concatenated with no separators. Direction comes from section context:
// "Your payments" = income; "Your interest" / "Your new charges" = expense.

function isCIBCCreditCard(text: string): boolean {
  // Two consecutive Mon-DD dates at line start is unique to CIBC CC format
  return /CIBC/i.test(text)
    && /(Visa|PAYMENT THANK YOU)/i.test(text)
    && /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{1,2}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{1,2}/i.test(text);
}

function parseCIBCCreditCard(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  const MONTH_NUM: Record<string, number> = {
    jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
    jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  };
  const MON_PAD: Record<string, string> = {
    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
  };

  // Year from "January 27to February 25, 2026" (space before "to" may be absent)
  let toYear = new Date().getFullYear();
  let fromYear = toYear;
  let fromMonthNum = 1;
  const periodMatch = text.match(/(\w+)\s+\d+\s*to\s+(\w+)\s+\d+,\s*(\d{4})/i);
  if (periodMatch) {
    toYear       = parseInt(periodMatch[3]);
    const toMon  = MONTH_NUM[periodMatch[2].toLowerCase()] ?? 12;
    fromMonthNum = MONTH_NUM[periodMatch[1].toLowerCase()] ?? 1;
    fromYear     = fromMonthNum > toMon ? toYear - 1 : toYear;
  }
  const getYear = (m: number) =>
    fromYear === toYear ? fromYear : m >= fromMonthNum ? fromYear : toYear;

  // Two-date prefix at line start: (TransMon TransDD)(PostMon PostDD)(rest)
  const TWO_DATE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{1,2})(.*)/i;

  // Header / footer / summary lines to skip
  const SKIP_RE = /^(?:Trans$|date$|Post$|dateDescription|Description|Amount|Spend|Card number\b|Page \d|Go Paperless|Visit\s|Transactions from|Annual interest|Previous\s|Payment options|Other credits|Purchases$|Cash advances$|Interest$|Fees$|Total charges|Total balance|Amount Due|Your account|CIBC$|MR |Account number\b|Statement Date|Contact|Customer\s+Service|Lost|TTY$|Online\b|Summary\b|Credit\s+Limit|Available|Interest rates|Regular purchases|Dividend|Tear|000000|Do not|For general|\*\d+\*)/i;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let section: 'payments' | 'other' = 'other';
  let pendingDate = '';
  let pendingLines: string[] = [];

  const flush = () => {
    if (!pendingDate || pendingLines.length === 0) { pendingLines = []; pendingDate = ''; return; }

    const fullText = pendingLines.join(' ').replace(/\s{2,}/g, ' ').trim();

    // Amount = last NN.NN on the line (optionally followed by CR for credit)
    const amtMatch = fullText.match(/([\d,]+\.\d{2})\s*(?:CR)?$/i);
    if (!amtMatch) { pendingLines = []; pendingDate = ''; return; }

    const amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    if (!isFinite(amount) || amount <= 0) { pendingLines = []; pendingDate = ''; return; }

    const isCR     = /\bCR\b$/i.test(fullText);
    const isPayment = section === 'payments'
      || /PAYMENT THANK YOU|PAIEMENT MERCI/i.test(fullText)
      || isCR;

    // Description = text before amount; strip trailing interest-rate (e.g. "21.99%")
    const desc = fullText.slice(0, amtMatch.index!)
      .replace(/\d+\.\d+%\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!desc || desc.length < 2) { pendingLines = []; pendingDate = ''; return; }

    const descClean = scrubPII(desc);
    results.push({
      postedDate: pendingDate,
      descriptionRaw: desc,
      descriptionClean: descClean,
      amount,
      type: isPayment ? 'income' : 'expense',
      category: categorizeTransaction(descClean),
      piiScrubbed: true,
    });

    pendingLines = [];
    pendingDate  = '';
  };

  for (const line of lines) {
    // Section switches determine income vs expense
    if (/Your payments/i.test(line))                { flush(); section = 'payments'; continue; }
    if (/Your interest/i.test(line))                { flush(); section = 'other';    continue; }
    if (/Your new charges and credits/i.test(line)) { flush(); section = 'other';    continue; }
    if (/^Total\b/i.test(line))                    { flush(); continue; }
    if (SKIP_RE.test(line))                         { continue; }

    const m = line.match(TWO_DATE);
    if (m) {
      flush();
      const [, , , postMon, postDay, rest] = m;
      const postMonNum = MONTH_NUM[postMon.toLowerCase()];
      pendingDate  = `${getYear(postMonNum)}-${MON_PAD[postMon.toLowerCase()]}-${postDay.padStart(2, '0')}`;
      pendingLines = [rest.trim()];
    } else if (pendingDate) {
      // Multi-line description continuation
      pendingLines.push(line);
      if (/([\d,]+\.\d{2})\s*(?:CR)?$/i.test(line)) flush();
    }
  }
  flush();

  return results;
}

// ── Wealthsimple Chequing parser ──────────────────────────────────────────────
// Wealthsimple PDFs concatenate two ISO dates then description then amount then balance.
// Format per line: (YYYY-MM-DD)(YYYY-MM-DD)(Description)(-?$Amount)($Balance)
// preprocessText() converts en-dashes to hyphens, so debits appear as -$NN.NN.

function isWealthsimpleFormat(text: string): boolean {
  return /Wealthsimple/i.test(text)
    && /\d{4}-\d{2}-\d{2}\d{4}-\d{2}-\d{2}/.test(text);
}

function parseWealthsimple(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  // Two consecutive ISO dates + description + signed amount + balance — all on one line
  const TX_LINE = /^(\d{4}-\d{2}-\d{2})(\d{4}-\d{2}-\d{2})(.*?)(-?\$[\d,]+\.\d{2})\$[\d,]+\.\d{2}$/;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const m = line.match(TX_LINE);
    if (!m) continue;

    const [, , postedDate, rawDesc, amtStr] = m;

    const isDebit = amtStr.startsWith('-');
    const amount  = parseFloat(amtStr.replace(/[$,\-]/g, ''));
    if (!isFinite(amount) || amount <= 0) continue;

    const desc = rawDesc.trim().replace(/\s+/g, ' ');
    if (!desc || desc.length < 2) continue;

    const descClean = scrubPII(desc);
    results.push({
      postedDate,
      descriptionRaw: desc,
      descriptionClean: descClean,
      amount,
      type: isDebit ? 'expense' : 'income',
      category: categorizeTransaction(descClean),
      piiScrubbed: true,
    });
  }

  return results;
}

// ── CIBC chequing / everyday account parser ───────────────────────────────────
// CIBC PDFs concatenate all columns: Date+Description+Withdrawal+Deposit+Balance.
// Every transaction line ends with the running balance (positive or negative).
// We derive both the transaction amount AND direction from consecutive balance deltas,
// which completely sidesteps the reference-number-bleeding problem.

function isCIBCFormat(text: string): boolean {
  return /DateDescriptionWithdrawals/i.test(text) ||
         /DateDescriptionDeposits/i.test(text);
}

function parseCIBCStatement(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  // Year from "For Jan 1 to Jan 31, 2026"
  const periodMatch = text.match(/For\s+\w+\s+\d+\s+to\s+\w+\s+\d+,\s+(\d{4})/i);
  const year = periodMatch ? parseInt(periodMatch[1]) : new Date().getFullYear();

  const MON: Record<string, string> = {
    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
  };

  // Extract all signed decimal amounts from a string
  const extractAmounts = (s: string): number[] =>
    [...s.matchAll(/([-]?\d{1,3}(?:,\d{3})*\.\d{2})/g)]
      .map(m => parseFloat(m[1].replace(/,/g, '')));

  // Strip trailing amount block from a string to expose the description prefix
  const stripTrailingAmts = (s: string) =>
    s.replace(/(?:[-]?\d{1,3}(?:,\d{3})*\.\d{2})+$/, '').trim();

  // Seed running balance from opening balance line (search full text once)
  let prevBalance = NaN;
  const openingLineMatch = text.match(/Opening balance[^\n]+/i);
  if (openingLineMatch) {
    const amts = extractAmounts(openingLineMatch[0]);
    if (amts.length > 0) prevBalance = amts[amts.length - 1];
  }

  // A line is a "balance terminator" when it ends with NN.NN
  const ENDS_WITH_AMT = /\d+\.\d{2}$/;

  // Lines that are headers / footers / metadata — never transactions
  const SKIP_RE = /^(?:Transaction details|DateDescription|Closing balance|Page \d|\d{5}[A-Z]|Contact|TTY|Outside|www\.|Account number|Branch transit|Account summary|For \w+|The names|CIBC Account|MR )/i;

  // Date at line start: "Jan 2" or "Jan 14" immediately followed by description (no separator)
  const DATE_START = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(.*)/i;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let currentDate = '';
  let descAccum: string[] = [];

  const flush = (terminatorLine: string) => {
    if (isNaN(prevBalance) || !currentDate) return;

    const amts = extractAmounts(terminatorLine);
    if (amts.length === 0) return;

    const newBalance = amts[amts.length - 1];
    const txnAmount  = Math.round(Math.abs(newBalance - prevBalance) * 100) / 100;

    // Zero delta = "Balance forward" duplicate or opening/closing summary — skip
    if (txnAmount < 0.01) { prevBalance = newBalance; descAccum = []; return; }

    const terminatorDesc = stripTrailingAmts(terminatorLine);
    const fullDesc = [...descAccum, terminatorDesc].filter(Boolean).join(' ').trim();
    descAccum = [];

    if (!fullDesc || fullDesc.length < 2) { prevBalance = newBalance; return; }

    const direction: "income" | "expense" = newBalance > prevBalance ? "income" : "expense";
    prevBalance = newBalance;

    const descClean = scrubPII(fullDesc);
    results.push({
      postedDate: currentDate,
      descriptionRaw: fullDesc,
      descriptionClean: descClean,
      amount: txnAmount,
      type: direction,
      category: categorizeTransaction(descClean),
      piiScrubbed: true,
    });
  };

  for (const line of lines) {
    // "Balance forward" is a page-continuation marker — resync running balance, never a txn
    if (/Balance forward/i.test(line)) {
      const amts = extractAmounts(line);
      if (amts.length > 0) prevBalance = amts[amts.length - 1];
      continue;
    }

    // Opening balance line — initialize if not already set
    if (/Opening balance/i.test(line)) {
      if (isNaN(prevBalance)) {
        const amts = extractAmounts(line);
        if (amts.length > 0) prevBalance = amts[amts.length - 1];
      }
      continue;
    }

    if (SKIP_RE.test(line)) continue;
    if (/^\(continued on next page\)/i.test(line)) continue;

    const dateMatch = line.match(DATE_START);
    if (dateMatch) {
      const [, mon, day, rest] = dateMatch;
      currentDate = `${year}-${MON[mon.toLowerCase()]}-${day.padStart(2, '0')}`;
      const restTrimmed = rest.trim();

      if (!restTrimmed) {
        descAccum = [];
      } else if (ENDS_WITH_AMT.test(restTrimmed)) {
        // Single-line transaction: date + desc + amounts all concatenated
        flush(restTrimmed);
      } else {
        // Multi-line: description continues on subsequent lines
        descAccum = [restTrimmed];
      }
    } else if (ENDS_WITH_AMT.test(line)) {
      // Terminator line with no date prefix — inherits currentDate
      flush(line);
    } else {
      // Description continuation
      descAccum.push(line);
    }
  }

  return results;
}

// ── Credit card parser ────────────────────────────────────────────────────────
// Purchases on CC statements are debits (expenses).
// Payments/credits reduce the balance (income).

function parseCreditCard(text: string, yearHint: number): ParsedTransaction[] {
  return parseGenericLines(text, yearHint).map(t => {
    // Payment lines always income
    if (/payment|thank\s+you|remittance|cr\b/i.test(t.descriptionClean) && t.type === "expense") {
      return { ...t, type: "income" as const };
    }
    return t;
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseStatement(pdfText: string): StatementParseResult {
  const text = recoverFragmentedText(preprocessText(pdfText));
  const yearHint = extractYear(text);
  const institution = detectInstitution(text);
  let statementType = detectStatementType(text);
  let accountTypeHint = detectAccountTypeHint(text);
  const accountMask = extractAccountMask(text);

  // Safety override: isCIBCFormat already reliably identifies CIBC chequing statements
  // via the concatenated column header. If it matches, the document is definitely a
  // bank/chequing account regardless of any "Visa" keyword in the PDF.
  if (isCIBCFormat(text) && !isCIBCCreditCard(text)) {
    statementType   = "bank";
    if (!accountTypeHint || accountTypeHint === "credit-card") accountTypeHint = "chequing";
  }
  const { from, to } = extractPeriod(text, yearHint);
  const warnings: string[] = [];

  let transactions: ParsedTransaction[];
  if (isTDConcatenatedFormat(text)) {
    transactions = parseTDConcatenated(text);
  } else if (isCIBCCreditCard(text)) {
    transactions = parseCIBCCreditCard(text);
  } else if (isWealthsimpleFormat(text)) {
    transactions = parseWealthsimple(text);
  } else if (isCIBCFormat(text)) {
    transactions = parseCIBCStatement(text);
  } else if (statementType === "credit-card") {
    transactions = parseCreditCard(text, yearHint);
  } else {
    transactions = parseGenericLines(text, yearHint);
  }

  // Deduplicate within the same PDF
  const seen = new Set<string>();
  transactions = transactions.filter(t => {
    const key = `${t.postedDate}-${t.amount}-${t.descriptionClean}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // TD's concatenated layout has no separator between an e-transfer's account
  // reference number and the transaction amount (e.g. "TFR-TO401222751.00"),
  // so the digit split between the two can occasionally be off by a digit or two.
  if (isTDConcatenatedFormat(text) && transactions.some(t => /TFR-(TO|FR)/i.test(t.descriptionRaw) && /\d$/.test(t.descriptionRaw))) {
    warnings.push(
      "Some e-transfer rows (TFR-TO/TFR-FR) have an account reference number directly " +
      "adjacent to the amount with no separator in the source PDF, so the parsed amount " +
      "may be off by a digit or two. Please double-check transfer amounts below before importing."
    );
  }

  if (transactions.length === 0) {
    warnings.push(
      "No transactions were detected. The PDF may be scanned (image-based), password-protected, or use " +
      "an unsupported layout. Try exporting a machine-readable PDF from your bank's online portal, or " +
      "use the CSV export instead."
    );
  } else if (transactions.length < 3) {
    warnings.push("Only a small number of transactions were found — review the preview carefully before importing.");
  }

  return { institutionGuess: institution, statementType, accountTypeHint, accountMask, periodFrom: from, periodTo: to, transactions, warnings };
}

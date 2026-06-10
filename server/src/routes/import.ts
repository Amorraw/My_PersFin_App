import { Router, Request, Response } from "express";
import { Transaction } from "../models/Transaction";
import { Account } from "../models/Account";
import { requireAuth } from "../middleware/requireLogin";
import { categorizeTransaction } from "../utils/categorization";
import { parseStatement } from "../utils/pdfStatementParser";
import { extractPdfText } from "../utils/pdfTextExtractor";
import multer from "multer";
import { parse } from "csv-parse/sync";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const LIABILITY_TYPES = new Set([
  "credit-card",
  "line-of-credit",
  "student-loan",
  "mortgage",
  "auto-loan",
  "personal-loan"
]);

async function getLatestImportedStatementBalance(userId: string, accountId: string): Promise<number | null> {
  const latestStatementTxn = await Transaction.findOne({
    userId,
    accountId,
    statementBalance: { $ne: null }
  }).sort({ date: -1, createdAt: -1, _id: -1 });

  if (!latestStatementTxn) return null;
  const value = (latestStatementTxn as any).statementBalance;
  return typeof value === "number" && isFinite(value) ? value : null;
}

// All routes require authentication
router.use(requireAuth);

// Upload and import transactions from CSV
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { accountId, dryRun = false, skipDuplicateIds = [] } = req.body;
    const normalizedDryRun = dryRun === true || dryRun === "true";

    let normalizedSkipDuplicateIds: string[] = [];
    if (Array.isArray(skipDuplicateIds)) {
      normalizedSkipDuplicateIds = skipDuplicateIds.map(String);
    } else if (typeof skipDuplicateIds === "string" && skipDuplicateIds.trim()) {
      try {
        const parsed = JSON.parse(skipDuplicateIds);
        normalizedSkipDuplicateIds = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        normalizedSkipDuplicateIds = [];
      }
    }
    // Debug logging
    console.log("Upload request received:");
    console.log("File:", req.file ? `${req.file.originalname} (${req.file.size} bytes)` : "No file");
    console.log("DryRun:", normalizedDryRun);
    console.log("SkipDuplicateIds:", normalizedSkipDuplicateIds);

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (!accountId) {
      return res.status(400).json({ message: "Account ID is required" });
    }

    // Verify account belongs to user
    const account = await Account.findOne({ _id: accountId, userId });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Parse CSV
    const fileContent = req.file.buffer.toString("utf-8");
    let records: any[];

    try {
      records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (parseErr) {
      return res.status(400).json({ message: "Failed to parse CSV file" });
    }

    if (records.length === 0) {
      return res.status(400).json({ message: "CSV file is empty" });
    }

    // Detect CSV format and map columns
    const mapping = detectCSVFormat(records);
    if (!mapping) {
      const detectedCols = Object.keys(records[0]);
      const headers = detectedCols.map(h => h.toLowerCase()).join(", ");
      console.error(`[IMPORT ERROR] CSV format not detected for account ${accountId}`);
      console.error(`[IMPORT ERROR] Detected columns: ${headers}`);
      console.error(`[IMPORT ERROR] First row:`, records[0]);
      return res.status(400).json({ 
        message: "Unable to detect CSV format. Expected columns: DATE, DESCRIPTION (or DESCIPTION), and either AMOUNT or both DEBIT and CREDIT.",
        detectedColumns: detectedCols,
        detectedHeaders: headers
      });
    }

    const importedTransactions = [];
    const errors = [];
    const duplicates = [];
    let accountBalanceChange = 0;
    // Build a fast lookup of existing transaction signatures for this account
    const existingTransactions = await Transaction.find(
      { userId, accountId },
      { date: 1, amount: 1, description: 1 }
    ).lean();
    const existingKeys = new Set<string>();
    for (const tx of existingTransactions) {
      const txDate = new Date(tx.date);
      const key = `${txDate.toDateString()}-${tx.amount}-${tx.description}`;
      existingKeys.add(key);
    }

    // First pass: parse all records and detect duplicates
    const parsedRecords = [];
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        const transaction = parseCSVRow(row, mapping, userId, accountId);
        
        // Auto-categorize if no category provided
        if (!transaction.category) {
          transaction.category = categorizeTransaction(transaction.description || "");
        }

        const duplicateKey = `${transaction.date.toDateString()}-${transaction.amount}-${transaction.description}`;
        // Only compare against already-imported transactions in the database.
        // Do not treat duplicates within the same uploaded file as duplicates.
        const isDuplicate = existingKeys.has(duplicateKey);
        
        if (isDuplicate) {
          duplicates.push({
            row: i + 1,
            key: duplicateKey,
            date: transaction.date,
            amount: transaction.amount,
            description: transaction.description,
            category: transaction.category,
            type: transaction.type
          });
        }

        parsedRecords.push({
          row: i + 1,
          transaction,
          isDuplicate,
          key: duplicateKey
        });
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    // If dry run, just return detected duplicates without importing
    if (normalizedDryRun) {
      return res.json({
        message: "Dry run completed - duplicates detected",
        isDryRun: true,
        duplicates: duplicates.length,
        duplicateDetails: duplicates,
        errors: errors.length,
        errorDetails: errors,
        totalRecords: parsedRecords.length,
        recordsToImport: parsedRecords.length - duplicates.length
      });
    }

    // Second pass: import records (skipping duplicates unless marked to keep)
    for (const record of parsedRecords) {
      if (record.isDuplicate && !normalizedSkipDuplicateIds.includes(record.key)) {
        // Skip this duplicate
        continue;
      }

      try {
        const saved = await Transaction.create(record.transaction);
        importedTransactions.push(saved);
        
        console.log(`[IMPORT] Created transaction: ${record.transaction.description} - ${record.transaction.type} $${record.transaction.amount}`);

        // Update account balance
        if (record.transaction.type === "income") {
          accountBalanceChange += record.transaction.amount;
        } else if (record.transaction.type === "expense") {
          accountBalanceChange -= record.transaction.amount;
        }
      } catch (err: any) {
        errors.push({ row: record.row, error: err.message });
        console.error(`[IMPORT ERROR] Failed to create transaction at row ${record.row}:`, err.message);
      }
    }

    // Update account balance once
    // For credit cards, reverse the balance change (debits increase what you owe, credits decrease it)
    console.log(`[IMPORT] Account type: ${account.type}`);
    console.log(`[IMPORT] Balance change from transactions: ${accountBalanceChange}`);
    console.log(`[IMPORT] Previous balance: ${account.balance}`);

    const latestStatementBalance = LIABILITY_TYPES.has(account.type)
      ? await getLatestImportedStatementBalance(userId, accountId)
      : null;

    if (latestStatementBalance !== null && LIABILITY_TYPES.has(account.type)) {
      account.balance = Math.max(0, latestStatementBalance);
    } else if (LIABILITY_TYPES.has(account.type)) {
      account.balance -= accountBalanceChange;
    } else {
      account.balance += accountBalanceChange;
    }

    console.log(`[IMPORT] New balance: ${account.balance}`);
    await account.save();

    return res.json({
      message: "Import completed",
      imported: importedTransactions.length,
      duplicatesSkipped: duplicates.length - parsedRecords.filter(r => r.isDuplicate && normalizedSkipDuplicateIds.includes(r.key)).length,
      duplicatesImported: parsedRecords.filter(r => r.isDuplicate && normalizedSkipDuplicateIds.includes(r.key)).length,
      errors: errors.length,
      errorDetails: errors,
      newBalance: account.balance,
      usedStatementBalance: latestStatementBalance !== null,
      transactions: importedTransactions
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error during import" });
  }
});

// Find duplicates for an account
router.get("/duplicates/:accountId", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { accountId } = req.params;

    // Verify account belongs to user
    const account = await Account.findOne({ _id: accountId, userId });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Get all transactions for the account
    const transactions = await Transaction.find({ userId, accountId }).sort({ date: 1 });

    // Group duplicates (same date + amount + description)
    const duplicateGroups: any[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < transactions.length; i++) {
      const tx1 = transactions[i];
      const key1 = `${tx1.date.toDateString()}-${tx1.amount}-${tx1.description}`;

      if (seen.has(key1)) continue;

      const group = [tx1];
      for (let j = i + 1; j < transactions.length; j++) {
        const tx2 = transactions[j];
        const key2 = `${tx2.date.toDateString()}-${tx2.amount}-${tx2.description}`;
        
        if (key1 === key2) {
          group.push(tx2);
          seen.add(key2);
        }
      }

      if (group.length > 1) {
        duplicateGroups.push(group);
        seen.add(key1);
      }
    }

    // Serialize duplicate groups to ensure _id and other ObjectIds are properly converted to string
    const serializedGroups = duplicateGroups.map((group: any[]) =>
      group.map((tx: any) => ({
        _id: tx._id ? tx._id.toString() : undefined,
        userId: tx.userId ? tx.userId.toString() : undefined,
        accountId: tx.accountId ? tx.accountId.toString() : undefined,
        type: tx.type,
        amount: tx.amount,
        category: tx.category || undefined,
        description: tx.description,
        date: tx.date,
        createdAt: tx.createdAt
      }))
    );

    return res.json({
      accountId,
      totalDuplicates: serializedGroups.reduce((sum, group) => sum + group.length, 0),
      duplicateGroups: serializedGroups
    });
  } catch (err) {
    console.error("Error in duplicates endpoint:", err);
    return res.status(500).json({ message: "Server error finding duplicates" });
  }
});

// Detect CSV format and map columns
function detectCSVFormat(records: any[]): any {
  const firstRow = records[0];
  const headers = Object.keys(firstRow).map(h => h.toLowerCase());

  // Common date column names
  const dateCol = headers.find(h =>
    h.includes("date") || h === "posted" || h === "transaction date" || h === "trans. date"
  );

  // Common description column names - including the TD Bank typo "desciption"
  const descCol = headers.find(h =>
    h.includes("description") || h.includes("desciption") || h.includes("memo") ||
    h.includes("merchant") || h === "name" || h.includes("payee")
  );

  // Amount columns - could be single amount or separate debit/credit
  const amountCandidates = headers.filter(h =>
    h === "amount" ||
    h.includes("amount") ||
    h.includes("amt") ||
    h.includes("charge") ||
    h.includes("transaction value")
  );
  const debitCol = headers.find(h => h.includes("debit") || h === "withdrawal");
  const creditCol = headers.find(h => h.includes("credit") || h === "deposit");
  const balanceCol = headers.find(h => h === "balance" || h.includes("balance"));
  const typeCol = headers.find(h =>
    h === "type" ||
    h.includes("transaction type") ||
    h.includes("trans type") ||
    h.includes("details") ||
    h.includes("record type")
  );

  if (!dateCol || !descCol) {
    return null;
  }

  if (amountCandidates.length === 0 && (!debitCol || !creditCol)) {
    return null;
  }

  // Get original case-sensitive column names
  const getOriginalName = (lowerName: string) => {
    return Object.keys(firstRow).find(k => k.toLowerCase() === lowerName) || lowerName;
  };

  const scoreAmountHeader = (lowerHeader: string) => {
    let score = 0;
    if (lowerHeader === "amount") score += 40;
    if (lowerHeader.includes("cad") || lowerHeader.includes("local")) score += 35;
    if (lowerHeader.includes("account")) score += 15;
    if (lowerHeader.includes("usd") || lowerHeader.includes("foreign") || lowerHeader.includes("original")) score -= 25;
    if (lowerHeader.includes("pending")) score -= 20;

    const originalHeader = getOriginalName(lowerHeader);
    const sampleRows = records.slice(0, 20);
    const nonEmptyCount = sampleRows.reduce((count, row) => {
      const rawValue = row[originalHeader];
      if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") return count;
      return count + 1;
    }, 0);

    score += nonEmptyCount * 2;
    return score;
  };

  const sortedAmountCandidates = [...amountCandidates].sort((a, b) => scoreAmountHeader(b) - scoreAmountHeader(a));
  const amountCols = sortedAmountCandidates.map(getOriginalName);
  const amountCol = amountCols[0] || null;

  return {
    dateCol: getOriginalName(dateCol),
    descCol: getOriginalName(descCol),
    amountCol,
    amountCols,
    debitCol: debitCol ? getOriginalName(debitCol) : null,
    creditCol: creditCol ? getOriginalName(creditCol) : null,
    balanceCol: balanceCol ? getOriginalName(balanceCol) : null,
    typeCol: typeCol ? getOriginalName(typeCol) : null,
    categoryCol: headers.find(h => h.includes("category")) ?
      getOriginalName(headers.find(h => h.includes("category"))!) : null
  };
}

// Parse a single CSV row into transaction data
function parseCSVRow(row: any, mapping: any, userId: string, accountId: string) {
  const dateStr = row[mapping.dateCol];
  const description = row[mapping.descCol];

  let amount = 0;
  let type: "income" | "expense" | "transfer" = "expense";

  if (mapping.amountCol) {
    // Single amount column
    const candidateAmountCols: string[] = Array.isArray(mapping.amountCols) && mapping.amountCols.length > 0
      ? mapping.amountCols
      : [mapping.amountCol];

    let parsedAmount: number | undefined = undefined;
    for (const col of candidateAmountCols) {
      const value = parseAmountValue(row[col]);
      if (!isFinite(value)) continue;
      if (value !== 0) {
        parsedAmount = value;
        break;
      }
      if (parsedAmount === undefined) {
        parsedAmount = value;
      }
    }

    amount = parsedAmount ?? NaN;
    const directionRaw = mapping.typeCol ? String(row[mapping.typeCol] ?? "") : "";
    const directionType = parseDirectionType(directionRaw);
    type = directionType ?? (amount < 0 ? "expense" : "income");
    amount = Math.abs(amount);
  } else {
    // Separate debit/credit columns
    const debitStr = row[mapping.debitCol] || "0";
    const creditStr = row[mapping.creditCol] || "0";

    const debit = parseAmountValue(debitStr) || 0;
    const credit = parseAmountValue(creditStr) || 0;

    if (credit > 0) {
      amount = credit;
      type = "income";
    } else if (debit > 0) {
      amount = debit;
      type = "expense";
    }
  }

  if (!isFinite(amount) || amount <= 0) {
    throw new Error("Invalid amount value");
  }

  // Parse date (try multiple formats)
  let date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // Try MM/DD/YYYY
    const parts = String(dateStr).split(/[\/\-]/);
    if (parts.length === 3) {
      date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
  }

  const category = mapping.categoryCol ? row[mapping.categoryCol] : null;
  const statementBalance = mapping.balanceCol ? parseAmountValue(row[mapping.balanceCol]) : null;

  return {
    userId,
    accountId,
    type,
    amount,
    description,
    category,
    statementBalance: isFinite(statementBalance as number) ? statementBalance : null,
    date: isNaN(date.getTime()) ? new Date() : date
  };
}

function parseAmountValue(rawValue: unknown): number {
  if (rawValue === null || rawValue === undefined) return 0;
  const original = String(rawValue).trim();
  if (!original) return 0;

  const hasParensNegative = /^\(.*\)$/.test(original);
  const hasTrailingNegative = /^.*[-\u2212]$/.test(original);
  const hasLeadingNegative = /^[-\u2212].*/.test(original);
  const hasDr = /\bDR\b/i.test(original);
  const hasCr = /\bCR\b/i.test(original);

  const normalized = original
    .replace(/\u2212/g, "-")
    .replace(/[$,\s]/g, "")
    .replace(/[()]/g, "")
    .replace(/^CR[:\s-]*/i, "")
    .replace(/^DR[:\s-]*/i, "")
    .replace(/CR$/i, "")
    .replace(/DR$/i, "")
    .replace(/^[+-]/, "")
    .replace(/[+-]$/, "");

  const parsed = parseFloat(normalized);
  if (!isFinite(parsed)) return NaN;

  let sign = 1;
  if (hasParensNegative || hasTrailingNegative || hasLeadingNegative || hasDr) sign = -1;
  if (hasCr) sign = 1;

  return parsed * sign;
}

function parseDirectionType(rawDirection: string): "income" | "expense" | null {
  const direction = rawDirection.toLowerCase().trim();
  if (!direction) return null;

  if (
    direction.includes("debit") ||
    direction.includes("purchase") ||
    direction.includes("pos") ||
    direction === "dr"
  ) {
    return "expense";
  }

  if (
    direction.includes("credit") ||
    direction.includes("payment") ||
    direction.includes("refund") ||
    direction.includes("reversal") ||
    direction === "cr"
  ) {
    return "income";
  }

  return null;
}
// ── PDF bank statement import ────────────────────────────────────────────────
// POST /api/import/statement
// Accepts a bank statement PDF, extracts text, scrubs PII, parses transactions.
// Pass dryRun=true to preview without saving; omit or false to persist.

router.post("/statement", upload.single("statement"), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { accountId, dryRun } = req.body;
    const isDryRun = dryRun === "true" || dryRun === true;

    if (!req.file) return res.status(400).json({ message: "PDF file required" });
    if (!accountId) return res.status(400).json({ message: "accountId is required" });

    const isFilePdf =
      req.file.mimetype === "application/pdf" ||
      req.file.originalname.toLowerCase().endsWith(".pdf");
    if (!isFilePdf) return res.status(400).json({ message: "Only PDF files are supported for statement import" });

    // Enforce a 20 MB cap
    if (req.file.size > 20 * 1024 * 1024) {
      return res.status(400).json({ message: "PDF must be smaller than 20 MB" });
    }

    const account = await Account.findOne({ _id: accountId, userId });
    if (!account) return res.status(404).json({ message: "Account not found" });

    // Extract text from PDF (layout-aware: preserves column spacing for table parsing)
    let pdfText: string;
    try {
      pdfText = await extractPdfText(req.file.buffer);
    } catch {
      return res.status(422).json({
        message: "Could not extract text from this PDF. It may be password-protected, corrupted, or a scanned image. Try exporting a machine-readable PDF from your bank's online portal."
      });
    }

    if (!pdfText.trim()) {
      return res.status(422).json({
        message: "This PDF appears to be scanned (image-only). Machine-readable PDFs exported from your bank's online portal work best."
      });
    }

    // Log extracted text to help diagnose layout issues
    console.log(`[PDF IMPORT] Extracted ${pdfText.length} chars. First 3000:\n${pdfText.slice(0, 3000)}`);

    // Parse statement
    const result = parseStatement(pdfText);
    console.log(`[PDF IMPORT] Parsed ${result.transactions.length} transactions (institution: ${result.institutionGuess})`);

    // Dry run: return preview without persisting
    if (isDryRun) {
      return res.json({
        isDryRun: true,
        institutionGuess: result.institutionGuess,
        statementType: result.statementType,
        accountTypeHint: result.accountTypeHint,
        accountMask: result.accountMask,
        periodFrom: result.periodFrom,
        periodTo: result.periodTo,
        transactionCount: result.transactions.length,
        transactions: result.transactions.slice(0, 200),
        warnings: result.warnings,
        rawTextSample: pdfText.slice(0, 3000),
      });
    }

    // Build dedup key set from existing transactions for this account
    const existingTxns = await Transaction.find(
      { userId, accountId },
      { date: 1, amount: 1, description: 1 }
    ).lean();
    const existingKeys = new Set(
      existingTxns.map(tx => `${new Date(tx.date).toDateString()}-${tx.amount}-${tx.description}`)
    );

    let imported = 0;
    let skipped = 0;
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < result.transactions.length; i++) {
      const t = result.transactions[i];
      try {
        const date = new Date(t.postedDate);
        const dupKey = `${date.toDateString()}-${t.amount}-${t.descriptionClean}`;
        if (existingKeys.has(dupKey)) { skipped++; continue; }

        await Transaction.create({
          userId,
          accountId,
          type: t.type,
          amount: t.amount,
          description: t.descriptionClean,
          category: t.category,
          date,
          source: "pdf",
        });
        imported++;
        existingKeys.add(dupKey); // prevent same-file dupes
      } catch (err: any) {
        errors.push({ index: i, error: err.message });
      }
    }

    return res.json({
      message: "PDF import completed",
      institutionGuess: result.institutionGuess,
      statementType: result.statementType,
      periodFrom: result.periodFrom,
      periodTo: result.periodTo,
      imported,
      skipped,
      total: result.transactions.length,
      errors: errors.length,
      errorDetails: errors,
      warnings: result.warnings,
    });
  } catch (err: any) {
    console.error("PDF import error:", err);
    return res.status(500).json({ message: "Server error during PDF import" });
  }
});

// Get CSV template
router.get("/template", (req: Request, res: Response) => {
  const template = `DATE,DESCRIPTION,DEBIT,CREDIT,BALANCE
01/05/2026,Paycheck Deposit,,2500.00,5500.00
01/06/2026,Grocery Store,67.89,,5432.11
01/07/2026,Gas Station,45.25,,5386.86
01/08/2026,ATM Withdrawal,100.00,,5286.86
01/09/2026,Restaurant,32.50,,5254.36`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=transaction_template.csv");
  return res.send(template);
});

export default router;































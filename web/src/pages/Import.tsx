// CSV and PDF import wizard for Canadian bank statements with duplicate detection
import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import type { Account } from "../types";
import { fmtMoney } from "../components/charts";
import './Import.css';

// ── Canadian bank catalogue ───────────────────────────────────────────────────
const CANADIAN_BANKS = [
  { id: "TD",            label: "TD",           fullName: "TD Canada Trust" },
  { id: "CIBC",          label: "CIBC",         fullName: "CIBC" },
  { id: "RBC",           label: "RBC",          fullName: "Royal Bank of Canada" },
  { id: "BMO",           label: "BMO",          fullName: "Bank of Montreal" },
  { id: "Scotiabank",    label: "Scotia",       fullName: "Scotiabank" },
  { id: "National Bank", label: "National",     fullName: "National Bank" },
  { id: "Tangerine",     label: "Tangerine",    fullName: "Tangerine" },
  { id: "Simplii",       label: "Simplii",      fullName: "Simplii Financial" },
  { id: "EQ Bank",       label: "EQ Bank",      fullName: "EQ Bank" },
  { id: "Wealthsimple",  label: "Wealthsimple", fullName: "Wealthsimple" },
  { id: "Desjardins",    label: "Desjardins",   fullName: "Desjardins" },
  { id: "Coast Capital", label: "Coast",        fullName: "Coast Capital Savings" },
  { id: "ATB",           label: "ATB",          fullName: "ATB Financial" },
  { id: "HSBC",          label: "HSBC",         fullName: "HSBC Canada" },
  { id: "Meridian",      label: "Meridian",     fullName: "Meridian Credit Union" },
  { id: "PC Financial",  label: "PC Fin.",      fullName: "PC Financial" },
  { id: "Other",         label: "Other",        fullName: "Other / Credit Union" },
];

const ACCOUNT_TYPES = [
  { value: "chequing",        label: "Chequing" },
  { value: "savings",         label: "Savings" },
  { value: "credit-card",     label: "Credit Card" },
  { value: "tfsa",            label: "TFSA" },
  { value: "rrsp",            label: "RRSP" },
  { value: "fhsa",            label: "FHSA" },
  { value: "gic",             label: "GIC" },
  { value: "line-of-credit",  label: "Line of Credit" },
  { value: "student-loan",    label: "Student Loan" },
  { value: "auto-loan",       label: "Auto Loan" },
  { value: "personal-loan",   label: "Personal Loan" },
  { value: "mortgage",        label: "Mortgage" },
  { value: "investment",      label: "Investment" },
  { value: "other",           label: "Other" },
];

// ── PDF account preferences (localStorage) ───────────────────────────────────
// Saves user-corrected Institution + Statement Type per account number so the
// next upload of the same account auto-applies the saved values.

interface PdfAccountPref { institution: string; statementType: string; }

const PDF_PREFS_KEY = "persfin_pdf_account_prefs";

function getPdfAccountPrefs(): Record<string, PdfAccountPref> {
  try { return JSON.parse(localStorage.getItem(PDF_PREFS_KEY) || "{}"); } catch { return {}; }
}

function savePdfAccountPref(key: string, pref: PdfAccountPref): void {
  const all = getPdfAccountPrefs();
  all[key] = pref;
  localStorage.setItem(PDF_PREFS_KEY, JSON.stringify(all));
}

function prefKey(institution: string, accountMask: string): string {
  return `${institution || "Unknown"}::${accountMask}`;
}

// ── Bank selector dropdown ────────────────────────────────────────────────────
function BankSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      className="bank-select"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">— Choose your bank —</option>
      {CANADIAN_BANKS.map(b => (
        <option key={b.id} value={b.id}>{b.fullName}</option>
      ))}
    </select>
  );
}

// ── Account setup form (shared between onboarding and inline) ─────────────────
interface SetupFormFields {
  bank: string;
  type: string;
  name: string;
  balance: number;
}


// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "csv" | "pdf";

interface PdfTransaction {
  postedDate: string;
  descriptionRaw: string;
  descriptionClean: string;
  amount: number;
  type: "income" | "expense";
  category: string;
}

interface PdfPreview {
  institutionGuess: string;
  statementType: string;
  accountTypeHint: string | null;
  accountMask: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  transactionCount: number;
  transactions: PdfTransaction[];
  warnings: string[];
  rawTextSample?: string;
}

// ── Main component ────────────────────────────────────────────────────────────
// Renders CSV/PDF upload tabs, column mapper, and transaction review table
export default function Import() {
  const [tab, setTab] = useState<Tab>("csv");

  // shared
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [loading, setLoading] = useState(true);

  // account setup / onboarding
  const [setup, setSetup] = useState<SetupFormFields>({ bank: "", type: "chequing", name: "", balance: 0 });
  const [setupImportMode, setSetupImportMode] = useState<"csv" | "pdf">("csv");
  const [setupCsvFile, setSetupCsvFile] = useState<File | null>(null);
  const [setupPdfFile, setSetupPdfFile] = useState<File | null>(null);
  const [setupImporting, setSetupImporting] = useState(false);
  const [setupResult, setSetupResult] = useState<{ accountName: string; imported?: number; error?: string } | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [showInlineSetup, setShowInlineSetup] = useState(false);
  const [inlineSetup, setInlineSetup] = useState<SetupFormFields>({ bank: "", type: "chequing", name: "", balance: 0 });
  const [inlineCreating, setInlineCreating] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // CSV tab
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [detectedDuplicates, setDetectedDuplicates] = useState<any[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedDuplicatesToKeep, setSelectedDuplicatesToKeep] = useState<Set<string>>(new Set());
  const [duplicateModalFile, setDuplicateModalFile] = useState<File | null>(null);
  const [duplicateHandlingMode, setDuplicateHandlingMode] = useState<"skip" | "keep" | "review">("skip");

  // PDF tab
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);
  const [pdfResult, setPdfResult] = useState<any>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfMeta, setPdfMeta] = useState<{
    institution: string; statementType: string; accountMask: string; periodFrom: string; periodTo: string;
  } | null>(null);
  const [prefSaved, setPrefSaved] = useState(false);
  const [prefLoaded, setPrefLoaded] = useState(false);

  useEffect(() => { loadAccounts(); }, []);

  // Auto-fill account name from bank + type selection
  useEffect(() => {
    if (!setup.bank) return;
    const bank = CANADIAN_BANKS.find(b => b.id === setup.bank);
    const typeLabel = ACCOUNT_TYPES.find(t => t.value === setup.type)?.label ?? "";
    if (bank) setSetup(s => ({ ...s, name: `${bank.id} ${typeLabel}` }));
  }, [setup.bank, setup.type]);

  useEffect(() => {
    if (!inlineSetup.bank) return;
    const bank = CANADIAN_BANKS.find(b => b.id === inlineSetup.bank);
    const typeLabel = ACCOUNT_TYPES.find(t => t.value === inlineSetup.type)?.label ?? "";
    if (bank) setInlineSetup(s => ({ ...s, name: `${bank.id} ${typeLabel}` }));
  }, [inlineSetup.bank, inlineSetup.type]);

  const loadAccounts = async () => {
    try {
      const data = await api("/accounts");
      setAccounts(data);
      // No auto-selection — user must choose explicitly each time
    } catch { }
    finally { setLoading(false); }
  };

  // ── Onboarding: create account + optional import ──────────────────────────
  const handleSetupImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup.name.trim()) { alert("Please enter an account name"); return; }

    setSetupImporting(true);
    setSetupError(null);

    try {
      const created = await api("/accounts", {
        method: "POST",
        body: JSON.stringify({ name: setup.name.trim(), type: setup.type, balance: setup.balance, currency: "CAD" }),
      });

      const file = setupImportMode === "csv" ? setupCsvFile : setupPdfFile;
      let imported = 0;
      let importErr = "";

      if (file) {
        const fd = new FormData();
        fd.append("accountId", created._id);
        fd.append("dryRun", "false");
        if (setupImportMode === "csv") {
          fd.append("file", file);
          const res = await fetch("/api/import/upload", { method: "POST", body: fd, credentials: "include" });
          const data = await res.json();
          if (!res.ok) importErr = data.message || "CSV import failed";
          else imported = data.imported || 0;
        } else {
          fd.append("statement", file);
          const res = await fetch("/api/import/statement", { method: "POST", body: fd, credentials: "include" });
          const data = await res.json();
          if (!res.ok) importErr = data.message || "PDF import failed";
          else imported = data.imported || 0;
        }
        if (!importErr) window.dispatchEvent(new Event("transactions-imported"));
      }

      setSetupResult({ accountName: setup.name.trim(), imported: file ? imported : undefined, error: importErr || undefined });
      setSetupCsvFile(null);
      setSetupPdfFile(null);
      await loadAccounts();
    } catch (err: any) {
      setSetupError(err.message || "Failed to create account");
    } finally {
      setSetupImporting(false);
    }
  };

  // ── Inline account creation (existing users) ──────────────────────────────
  const handleInlineCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineSetup.name.trim()) { alert("Please enter an account name"); return; }

    setInlineCreating(true);
    setInlineError(null);

    try {
      const created = await api("/accounts", {
        method: "POST",
        body: JSON.stringify({ name: inlineSetup.name.trim(), type: inlineSetup.type, balance: inlineSetup.balance, currency: "CAD" }),
      });
      await loadAccounts();
      setSelectedAccount(created._id);
      setShowInlineSetup(false);
      setInlineSetup({ bank: "", type: "chequing", name: "", balance: 0 });
    } catch (err: any) {
      setInlineError(err.message || "Failed to create account");
    } finally {
      setInlineCreating(false);
    }
  };

  // ── CSV helpers ───────────────────────────────────────────────────────────
  const closeDuplicateModal = () => {
    setShowDuplicateModal(false);
    setDuplicateHandlingMode("skip");
    setDetectedDuplicates([]);
    setSelectedDuplicatesToKeep(new Set());
    setDuplicateModalFile(null);
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setCsvFile(e.target.files[0]);
      setResult(null);
      setDetectedDuplicates([]);
      setShowDuplicateModal(false);
      setSelectedDuplicatesToKeep(new Set());
      setDuplicateModalFile(null);
    }
  };

  const performDryRun = async (uploadFile: File) => {
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("accountId", selectedAccount);
    fd.append("dryRun", "true");
    const res = await fetch("/api/import/upload", { method: "POST", body: fd, credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const dups = data.duplicateDetails || [];
    const total = data.totalRecords || 0;
    return { duplicates: dups, hasDuplicates: dups.length > 0, totalRecords: total,
      allAlreadyImported: total > 0 && dups.length === total,
      errors: data.errors || 0, errorDetails: data.errorDetails || [] };
  };

  const performActualImport = async (uploadFile: File, duplicateKeysToImport: string[]) => {
    try {
      setImporting(true);
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("accountId", selectedAccount);
      fd.append("dryRun", "false");
      fd.append("skipDuplicateIds", JSON.stringify(duplicateKeysToImport));
      const res = await fetch("/api/import/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data);
      window.dispatchEvent(new Event("transactions-imported"));
      setCsvFile(null);
      const fileInput = document.getElementById("csv-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      closeDuplicateModal();
    } catch (err: any) {
      alert("Import error: " + (err.message || "Unknown error"));
    } finally {
      setImporting(false);
    }
  };

  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile || !selectedAccount) { alert("Please select a file and account"); return; }
    setImporting(true);
    setResult(null);
    try {
      const { allAlreadyImported, errors, errorDetails } = await performDryRun(csvFile);
      if (allAlreadyImported) { alert("All transactions in this file are already imported."); setImporting(false); return; }
      if (errors > 0) {
        const preview = errorDetails.slice(0, 5).map((d: any) => `Row ${d.row}: ${d.error}`).join("\n");
        const go = window.confirm(`Detected ${errors} CSV row error(s).\n\n${preview}${errorDetails.length > 5 ? "\n..." : ""}\n\nContinue importing valid rows?`);
        if (!go) { setResult({ imported: 0, duplicatesSkipped: 0, duplicatesImported: 0, errors, errorDetails, message: "Import cancelled." }); setImporting(false); return; }
      }
      await performActualImport(csvFile, []);
    } catch (err: any) {
      alert("Error: " + (err.message || "Unknown error"));
      setImporting(false);
    }
  };

  const handleDuplicateDecision = async (mode: "skip" | "keep" | "review") => {
    const target = duplicateModalFile || csvFile;
    if (!target) { alert("Please select the CSV file again."); closeDuplicateModal(); return; }
    if (mode === "skip") await performActualImport(target, []);
    else if (mode === "keep") await performActualImport(target, detectedDuplicates.map(d => d.key));
    else setDuplicateHandlingMode("review");
  };

  const handleToggleDuplicate = (key: string) => {
    const next = new Set(selectedDuplicatesToKeep);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedDuplicatesToKeep(next);
  };

  const handleConfirmReview = async () => {
    const target = duplicateModalFile || csvFile;
    if (!target) { alert("Please select the CSV file again."); closeDuplicateModal(); return; }
    await performActualImport(target, detectedDuplicates.map(d => d.key).filter(k => selectedDuplicatesToKeep.has(k)));
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/import/template", { credentials: "include" });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "transaction_template.csv"; a.click();
    } catch { alert("Failed to download template"); }
  };

  // ── PDF helpers ───────────────────────────────────────────────────────────
  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setPdfFile(e.target.files[0]);
      setPdfPreview(null);
      setPdfResult(null);
      setPdfError(null);
      setPdfMeta(null);
      setPrefSaved(false);
      setPrefLoaded(false);
    }
  };

  const handlePdfPreview = async () => {
    if (!pdfFile || !selectedAccount) { alert("Please select a PDF and an account"); return; }
    setPdfParsing(true);
    setPdfPreview(null);
    setPdfMeta(null);
    setPdfResult(null);
    setPdfError(null);
    setPrefSaved(false);
    setPrefLoaded(false);
    try {
      const fd = new FormData();
      fd.append("statement", pdfFile);
      fd.append("accountId", selectedAccount);
      fd.append("dryRun", "true");
      const res = await fetch("/api/import/statement", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Parse failed");
      setPdfPreview(data);
      // Map parser institution to a CANADIAN_BANKS id; fall back to account name inference
      let instId = CANADIAN_BANKS.find(b => b.id === data.institutionGuess) ? data.institutionGuess : "";
      if (!instId) {
        const acct = accounts.find(a => a._id === selectedAccount);
        if (acct) {
          const match = CANADIAN_BANKS.find(b =>
            acct.name.toLowerCase().includes(b.id.toLowerCase()) ||
            acct.name.toLowerCase().includes(b.label.toLowerCase())
          );
          instId = match ? match.id : "Unknown";
        } else {
          instId = "Unknown";
        }
      }
      // Derive period from transaction dates when the header parser finds nothing
      let periodFrom = data.periodFrom || "";
      let periodTo   = data.periodTo   || "";
      if (data.transactions && data.transactions.length > 0) {
        const sortedDates = (data.transactions as PdfTransaction[])
          .map((t: PdfTransaction) => t.postedDate)
          .filter(Boolean)
          .sort();
        if (!periodFrom) periodFrom = sortedDates[0];
        if (!periodTo)   periodTo   = sortedDates[sortedDates.length - 1];
      }
      // Account: use whatever the PDF parser extracted — leave blank if nothing found
      const accountDisplay = data.accountMask || "";
      // Type: PDF content wins (accountTypeHint), then coarse statementType mapping,
      // then selected account's own type as absolute last resort
      const selAcct = accounts.find(a => a._id === selectedAccount);
      const initType: string =
        data.accountTypeHint ||
        (data.statementType === "credit-card" ? "credit-card"
          : data.statementType === "bank" ? "chequing"
          : selAcct?.type || "other");

      // Check if the user has previously saved preferences for this account number
      let finalInstitution = instId;
      let finalStatementType = initType;
      if (accountDisplay) {
        const saved = getPdfAccountPrefs()[prefKey(instId, accountDisplay)];
        if (saved) {
          finalInstitution = saved.institution || instId;
          finalStatementType = saved.statementType;
          setPrefLoaded(true);
        }
      }

      setPdfMeta({
        institution: finalInstitution,
        statementType: finalStatementType,
        accountMask: accountDisplay,
        periodFrom,
        periodTo,
      });
    } catch (err: any) {
      setPdfError(err.message || "Failed to parse PDF");
    } finally {
      setPdfParsing(false);
    }
  };

  const handleSavePref = () => {
    if (!pdfMeta?.accountMask) return;
    const key = prefKey(pdfMeta.institution, pdfMeta.accountMask);
    savePdfAccountPref(key, { institution: pdfMeta.institution, statementType: pdfMeta.statementType });
    setPrefSaved(true);
    setPrefLoaded(false);
    setTimeout(() => setPrefSaved(false), 2500);
  };

  const handlePdfClear = () => {
    setSelectedAccount("");
    setPdfFile(null);
    setPdfPreview(null);
    setPdfMeta(null);
    setPdfResult(null);
    setPdfError(null);
    setPrefSaved(false);
    setPrefLoaded(false);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  const handlePdfImport = async () => {
    if (!pdfFile || !selectedAccount) return;
    setPdfImporting(true);
    setPdfError(null);
    try {
      const fd = new FormData();
      fd.append("statement", pdfFile);
      fd.append("accountId", selectedAccount);
      fd.append("dryRun", "false");
      const res = await fetch("/api/import/statement", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      setPdfResult(data);
      setPdfPreview(null);
      setPdfMeta(null);
      setPdfFile(null);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      window.dispatchEvent(new Event("transactions-imported"));
    } catch (err: any) {
      setPdfError(err.message || "Failed to import PDF");
    } finally {
      setPdfImporting(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  // ── ONBOARDING: new user with no accounts ─────────────────────────────────
  if (accounts.length === 0) {
    const hasFile = setupImportMode === "csv" ? !!setupCsvFile : !!setupPdfFile;

    return (
      <div className="page">
        <h1>Import Transactions</h1>
        <div className="card onboarding-card">
          <div className="onboarding-header">
            <h2>Get started — set up your first account</h2>
            <p>Select your bank, pick an account type, and optionally upload a CSV or PDF statement to instantly populate your transaction history.</p>
          </div>

          <form onSubmit={handleSetupImport} className="setup-form">

            {/* Step 1 — Bank */}
            <div className="setup-section">
              <div className="setup-section-label">
                <span className="setup-step-num">1</span>
                Select your bank
              </div>
              <BankSelector value={setup.bank} onChange={v => setSetup(s => ({ ...s, bank: v }))} />
            </div>

            {/* Step 2 — Account details */}
            <div className="setup-section">
              <div className="setup-section-label">
                <span className="setup-step-num">2</span>
                Account details
              </div>
              <div className="setup-fields-row">
                <label className="setup-field">
                  Account Type
                  <select value={setup.type} onChange={e => setSetup(s => ({ ...s, type: e.target.value }))}>
                    {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
                <label className="setup-field setup-field-grow">
                  Account Name
                  <input
                    type="text"
                    value={setup.name}
                    onChange={e => setSetup(s => ({ ...s, name: e.target.value }))}
                    placeholder="e.g. TD Chequing"
                    required
                  />
                </label>
                <label className="setup-field">
                  Opening Balance (CAD)
                  <input
                    type="number"
                    step="0.01"
                    value={setup.balance}
                    onChange={e => setSetup(s => ({ ...s, balance: parseFloat(e.target.value) || 0 }))}
                  />
                </label>
              </div>
            </div>

            {/* Step 3 — Import file (optional) */}
            <div className="setup-section">
              <div className="setup-section-label">
                <span className="setup-step-num">3</span>
                Import transactions
                <span className="optional-badge">optional</span>
              </div>
              <p className="setup-section-desc">
                Upload a file downloaded from your bank's online portal to populate your transaction history automatically.
              </p>

              <div className="import-mode-toggle">
                <button type="button" className={`mode-tab${setupImportMode === "csv" ? " active" : ""}`} onClick={() => setSetupImportMode("csv")}>CSV File</button>
                <button type="button" className={`mode-tab${setupImportMode === "pdf" ? " active" : ""}`} onClick={() => setSetupImportMode("pdf")}>PDF Statement</button>
              </div>

              {setupImportMode === "csv" ? (
                <div className="setup-file-area">
                  <input type="file" accept=".csv" onChange={e => setSetupCsvFile(e.target.files?.[0] || null)} />
                  {setupCsvFile && <div className="file-info">Selected: <strong>{setupCsvFile.name}</strong> ({(setupCsvFile.size / 1024).toFixed(1)} KB)</div>}
                  <div className="setup-hint">
                    In your bank's online portal, go to your account activity and export/download as CSV.
                    Columns should include Date, Description, and Amount (or separate Debit/Credit columns).
                  </div>
                </div>
              ) : (
                <div className="setup-file-area">
                  <input type="file" accept=".pdf,application/pdf" onChange={e => setSetupPdfFile(e.target.files?.[0] || null)} />
                  {setupPdfFile && <div className="file-info">Selected: <strong>{setupPdfFile.name}</strong> ({(setupPdfFile.size / 1024).toFixed(1)} KB)</div>}
                  <div className="pdf-info-note">
                    <strong>Supported banks:</strong> TD, CIBC (chequing &amp; credit card), RBC, BMO, Scotiabank,
                    Wealthsimple, Tangerine, Simplii, EQ Bank, and most Canadian institutions that export
                    machine-readable PDFs. Scanned or password-protected PDFs are not supported.
                  </div>
                </div>
              )}
            </div>

            {setupError && <div className="pdf-error-notice">{setupError}</div>}

            <div className="setup-actions">
              <button
                type="submit"
                className="btn setup-submit-btn"
                disabled={setupImporting || !setup.name.trim()}
              >
                {setupImporting ? "Setting up..." : hasFile ? "Create Account & Import" : "Create Account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── Shared account selector + inline account creation ─────────────────────

  const accountSelectorRow = (
    <div className="account-selector-row">
      <label className="import-account-label">
        Target Account:
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="">— Select account —</option>
          {accounts.map(acc => (
            <option key={acc._id} value={acc._id}>{acc.name} — {fmtMoney(acc.balance)}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={`btn-outline-sm${showInlineSetup ? " active" : ""}`}
        onClick={() => { setShowInlineSetup(v => !v); setInlineError(null); }}
      >
        {showInlineSetup ? "Cancel" : "+ Add Account"}
      </button>
    </div>
  );

  const inlineSetupPanel = showInlineSetup && (
    <div className="inline-setup-panel">
      <h4 className="inline-setup-title">Add a New Bank Account</h4>
      <form onSubmit={handleInlineCreate}>
        <div className="setup-section" style={{ paddingTop: 0 }}>
          <div className="setup-section-label" style={{ marginBottom: 8 }}>Select your bank</div>
          <BankSelector value={inlineSetup.bank} onChange={v => setInlineSetup(s => ({ ...s, bank: v }))} />
        </div>
        <div className="setup-fields-row" style={{ marginTop: 12 }}>
          <label className="setup-field">
            Account Type
            <select value={inlineSetup.type} onChange={e => setInlineSetup(s => ({ ...s, type: e.target.value }))}>
              {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="setup-field setup-field-grow">
            Account Name
            <input
              type="text"
              value={inlineSetup.name}
              onChange={e => setInlineSetup(s => ({ ...s, name: e.target.value }))}
              placeholder="e.g. RBC Savings"
              required
            />
          </label>
          <label className="setup-field">
            Opening Balance (CAD)
            <input
              type="number"
              step="0.01"
              value={inlineSetup.balance}
              onChange={e => setInlineSetup(s => ({ ...s, balance: parseFloat(e.target.value) || 0 }))}
            />
          </label>
        </div>
        {inlineError && <div className="pdf-error-notice" style={{ marginTop: 8 }}>{inlineError}</div>}
        <div className="setup-actions" style={{ marginTop: 12 }}>
          <button type="submit" className="btn" disabled={inlineCreating || !inlineSetup.name.trim()}>
            {inlineCreating ? "Creating..." : "Create Account"}
          </button>
        </div>
      </form>
    </div>
  );

  // ── Success banner (after onboarding or inline create) ────────────────────
  const successBanner = setupResult && (
    <div className="setup-success-banner">
      <div>
        <strong>Account "{setupResult.accountName}" created.</strong>
        {setupResult.imported !== undefined && (
          <> {setupResult.imported} transaction{setupResult.imported !== 1 ? "s" : ""} imported.</>
        )}
        {setupResult.error && <span className="setup-import-warn"> Note: {setupResult.error}</span>}
      </div>
      <button type="button" className="dismiss-btn" onClick={() => setSetupResult(null)}>&#x2715;</button>
    </div>
  );

  // ── Normal import UI ──────────────────────────────────────────────────────
  return (
    <div className="page">
      <h1>Import Transactions</h1>

      {successBanner}

      <div className="import-tab-bar">
        {(["csv", "pdf"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "pdf") {
                setSelectedAccount("");
                setPdfPreview(null);
                setPdfMeta(null);
                setPdfResult(null);
                setPdfError(null);
                setPdfFile(null);
                if (pdfInputRef.current) pdfInputRef.current.value = "";
              }
            }}
            className={`import-tab-btn${tab === t ? " active" : ""}`}
          >
            {t === "csv" ? "CSV Import" : "PDF Statement"}
          </button>
        ))}
      </div>

      {/* ── CSV Tab ── */}
      {tab === "csv" && (
        <div className="card">
          <h3>Upload CSV File</h3>
          <p>Import transactions from a bank-exported CSV file.</p>
          <button onClick={downloadTemplate} className="btn-secondary" style={{ marginBottom: "1rem" }}>
            Download CSV Template
          </button>

          <form onSubmit={handleCsvUpload} className="import-form">
            {accountSelectorRow}
            {inlineSetupPanel}

            <label>
              Choose CSV File:
              <input id="csv-file-input" type="file" accept=".csv" onChange={handleCsvFileChange} required />
            </label>

            {csvFile && (
              <div className="file-info">Selected: <strong>{csvFile.name}</strong> ({(csvFile.size / 1024).toFixed(2)} KB)</div>
            )}

            <button type="submit" disabled={importing || !csvFile}>
              {importing ? "Importing..." : "Upload and Import"}
            </button>
          </form>

          {showDuplicateModal && (
            <div className="dup-modal-overlay" onClick={closeDuplicateModal}>
              <div className="dup-modal" onClick={e => e.stopPropagation()}>
                <h3>Duplicate Transactions Detected</h3>
                <p>Found <strong>{detectedDuplicates.length}</strong> duplicate transaction(s).</p>
                {duplicateHandlingMode !== "review" ? (
                  <>
                    <h4>Choose an option:</h4>
                    <div className="dup-actions">
                      <button type="button" onClick={() => handleDuplicateDecision("skip")} className="btn btn-primary" disabled={importing}>Skip All Duplicates (Recommended)</button>
                      <button type="button" onClick={() => handleDuplicateDecision("keep")} className="btn btn-secondary" disabled={importing}>Keep All Duplicates</button>
                      <button type="button" onClick={() => handleDuplicateDecision("review")} className="btn btn-secondary" disabled={importing}>Review &amp; Choose</button>
                      <button type="button" onClick={closeDuplicateModal} className="btn btn-secondary" disabled={importing}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <h4>Select which duplicates to import:</h4>
                    <div className="dup-review-list">
                      {detectedDuplicates.map((dup, idx) => (
                        <label key={idx} className={`dup-review-item${selectedDuplicatesToKeep.has(dup.key) ? " selected" : " unselected"}`}>
                          <input type="checkbox" checked={selectedDuplicatesToKeep.has(dup.key)} onChange={() => handleToggleDuplicate(dup.key)} />
                          <div><strong>{new Date(dup.date).toLocaleDateString()}</strong> — {fmtMoney(dup.amount)} — {dup.description}</div>
                        </label>
                      ))}
                    </div>
                    <div className="dup-review-actions">
                      <button type="button" onClick={handleConfirmReview} className="btn btn-primary" disabled={importing}>Confirm Selection</button>
                      <button type="button" onClick={() => setDuplicateHandlingMode("skip")} className="btn btn-secondary" disabled={importing}>Back</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {result && (
            <div className={`result ${result.errors > 0 ? "warning" : "success"}`}>
              <h4>Import Results</h4>
              {result.message && <p>{result.message}</p>}
              <p>Successfully imported: <strong>{result.imported}</strong> transactions</p>
              {result.duplicatesSkipped > 0 && <p>Duplicates skipped: <strong>{result.duplicatesSkipped}</strong></p>}
              {result.duplicatesImported > 0 && <p>Duplicates imported: <strong>{result.duplicatesImported}</strong></p>}
              {result.errors > 0 && <p>Errors: <strong>{result.errors}</strong></p>}
              {Array.isArray(result.errorDetails) && result.errorDetails.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <h5 style={{ marginBottom: "0.5rem" }}>Error Details</h5>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", maxHeight: "220px", overflowY: "auto" }}>
                    {result.errorDetails.map((d: any, i: number) => (
                      <li key={i}>Row {d.row ?? "?"}: {d.error || "Unknown error"}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── PDF Tab ── */}
      {tab === "pdf" && (
        <div className="card">
          <h3>Import Bank Statement PDF</h3>
          <p>
            Upload a machine-readable PDF exported from your bank's online portal. PII (account numbers, emails) is scrubbed before storage. Scanned or password-protected PDFs are not supported.
          </p>

          <div className="pdf-info-note">
            <strong>Supported banks:</strong> TD (chequing), CIBC (chequing &amp; Visa credit card), RBC, BMO,
            Scotiabank, Wealthsimple, Tangerine, Simplii, EQ Bank, National Bank, Desjardins, and most
            Canadian institutions that export machine-readable PDFs.
          </div>

          {accountSelectorRow}
          {inlineSetupPanel}

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Choose PDF Statement:
              <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" onChange={handlePdfFileChange} style={{ display: "block", marginTop: "0.35rem" }} />
            </label>
            {pdfFile && (
              <div className="file-info">Selected: <strong>{pdfFile.name}</strong> ({(pdfFile.size / 1024).toFixed(2)} KB)</div>
            )}
          </div>

          <div className="pdf-action-row">
            <button onClick={handlePdfPreview} disabled={!pdfFile || pdfParsing || pdfImporting} className="btn btn-secondary">
              {pdfParsing ? "Parsing..." : "Preview Transactions"}
            </button>
            {pdfPreview && pdfPreview.transactionCount > 0 && (
              <button onClick={handlePdfImport} disabled={pdfImporting} className="btn-import">
                {pdfImporting ? "Importing..." : `Import ${pdfPreview.transactionCount} Transactions`}
              </button>
            )}
            {pdfPreview && (
              <button onClick={handlePdfClear} disabled={pdfImporting} className="btn-pdf-clear">
                Clear
              </button>
            )}
          </div>

          {pdfError && <div className="pdf-error-notice">{pdfError}</div>}

          {pdfPreview && (
            <div style={{ marginTop: "1rem" }}>
              <div className="pdf-summary-bar">
                <div className="pdf-summary-card">
                  <div className="pdf-summary-label">Institution</div>
                  <select
                    className="pdf-meta-select"
                    value={pdfMeta?.institution ?? "Unknown"}
                    onChange={e => setPdfMeta(m => m ? { ...m, institution: e.target.value } : m)}
                  >
                    <option value="Unknown">Unknown</option>
                    {CANADIAN_BANKS.map(b => (
                      <option key={b.id} value={b.id}>{b.fullName}</option>
                    ))}
                  </select>
                </div>
                <div className="pdf-summary-card">
                  <div className="pdf-summary-label">Statement Type</div>
                  <select
                    className="pdf-meta-select"
                    value={pdfMeta?.statementType ?? pdfPreview.accountTypeHint ?? pdfPreview.statementType}
                    onChange={e => setPdfMeta(m => m ? { ...m, statementType: e.target.value } : m)}
                  >
                    {ACCOUNT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <div className="pdf-summary-card">
                  <div className="pdf-summary-label">Account Number</div>
                  <input
                    className="pdf-meta-input"
                    type="text"
                    value={pdfMeta?.accountMask ?? (pdfPreview.accountMask ?? "")}
                    onChange={e => setPdfMeta(m => m ? { ...m, accountMask: e.target.value } : m)}
                    placeholder="—"
                  />
                </div>
                <div className="pdf-summary-card pdf-summary-card--period">
                  <div className="pdf-summary-label">Period</div>
                  <div className="pdf-meta-period">
                    <input
                      className="pdf-meta-input"
                      type="date"
                      value={pdfMeta?.periodFrom ?? (pdfPreview.periodFrom ?? "")}
                      onChange={e => setPdfMeta(m => m ? { ...m, periodFrom: e.target.value } : m)}
                    />
                    <span className="pdf-meta-arrow">→</span>
                    <input
                      className="pdf-meta-input"
                      type="date"
                      value={pdfMeta?.periodTo ?? (pdfPreview.periodTo ?? "")}
                      onChange={e => setPdfMeta(m => m ? { ...m, periodTo: e.target.value } : m)}
                    />
                  </div>
                </div>
                <div className="pdf-summary-card">
                  <div className="pdf-summary-label">Transaction(s) Found</div>
                  <div className="pdf-summary-value">{pdfPreview.transactionCount}</div>
                </div>
              </div>

              {/* ── Preference row: save / loaded indicator ── */}
              <div className="pdf-pref-row">
                {prefLoaded && (
                  <span className="pdf-pref-badge">Preferences applied from previous import</span>
                )}
                {prefSaved && (
                  <span className="pdf-pref-badge pdf-pref-badge--saved">Preferences saved!</span>
                )}
                <button
                  type="button"
                  className="btn-save-pref"
                  onClick={handleSavePref}
                  disabled={!pdfMeta?.accountMask}
                  title={pdfMeta?.accountMask ? `Save settings for account ${pdfMeta.accountMask}` : "No account number found — cannot save"}
                >
                  Save Preferences
                </button>
              </div>

              {pdfPreview.warnings.length > 0 && (
                <div className="pdf-warning-notice">
                  {pdfPreview.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}

              {pdfPreview.rawTextSample && (
                <details style={{ marginTop: "0.5rem" }}>
                  <summary style={{ cursor: "pointer", fontSize: "0.75rem", color: "var(--text-light)" }}>
                    {pdfPreview.transactionCount === 0
                      ? "Show raw extracted text (for diagnosis)"
                      : "Show raw PDF text (debug)"}
                  </summary>
                  <pre style={{ marginTop: "0.5rem", padding: "0.75rem", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "0.68rem", overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: "260px", overflowY: "auto", color: "var(--text)" }}>
                    {pdfPreview.rawTextSample}
                  </pre>
                </details>
              )}

              {pdfPreview.transactions.length > 0 && (
                <>
                  <h4 style={{ marginBottom: "0.5rem" }}>Preview (first {Math.min(pdfPreview.transactions.length, 20)} of {pdfPreview.transactionCount})</h4>
                  <div className="pdf-preview-table-wrap">
                    <table className="pdf-preview-table">
                      <thead>
                        <tr>{["Date", "Description", "Category", "Amount", "Type"].map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {[...pdfPreview.transactions]
                          .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
                          .slice(0, 20)
                          .map((t, i) => (
                          <tr key={i}>
                            <td style={{ whiteSpace: "nowrap" }}>{t.postedDate}</td>
                            <td style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.descriptionClean}>{t.descriptionClean}</td>
                            <td>{t.category}</td>
                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoney(t.amount)}</td>
                            <td><span className={`pdf-tx-type-badge ${t.type}`}>{t.type}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pdfPreview.transactions.length > 20 && (
                    <p className="pdf-preview-more">…and {pdfPreview.transactions.length - 20} more. All will be imported.</p>
                  )}
                </>
              )}
            </div>
          )}

          {pdfResult && (
            <div className="result success" style={{ marginTop: "1rem" }}>
              <h4>PDF Import Complete</h4>
              <p>Detected institution: <strong>{pdfResult.institutionGuess}</strong></p>
              {pdfResult.periodFrom && <p>Statement period: <strong>{pdfResult.periodFrom} → {pdfResult.periodTo ?? "?"}</strong></p>}
              <p>Transactions imported: <strong>{pdfResult.imported}</strong></p>
              {pdfResult.skipped > 0 && <p>Duplicates skipped: <strong>{pdfResult.skipped}</strong></p>}
              {pdfResult.errors > 0 && <p style={{ color: "var(--danger)" }}>Errors: <strong>{pdfResult.errors}</strong></p>}
              {pdfResult.warnings?.length > 0 && (
                <div style={{ marginTop: "0.5rem", color: "var(--warning)" }}>
                  {pdfResult.warnings.map((w: string, i: number) => <div key={i}>{w}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

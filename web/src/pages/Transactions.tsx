// Full transaction ledger with filtering, pagination, and cash-flow chart
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { api } from "../api";
import type { Transaction, Account, CategoryMajor } from "../types";
import { CATEGORY_CATALOG } from "../data/categoryCatalog";
import { TrendAreaChart, fmtMoney } from "../components/charts";
import './Transactions.css';
import { DEBT_ACCOUNT_TYPES, INVESTMENT_TYPES } from "../utils/constants";

const ITEMS_PER_PAGE = 100;
const ALL_ACCOUNTS = "__all_accounts__";
type FilterKey = "date" | "description" | "category" | "account" | "type";
type AccountTab = "all" | "chequing" | "savings" | "credit-cards" | "debts" | "investments" | "other";

const tabLabel: Record<AccountTab, string> = {
  all: "All",
  chequing: "Chequing",
  savings: "Savings",
  "credit-cards": "Credit Cards",
  debts: "Debts",
  investments: "Investments",
  other: "Other"
};

const tabs: AccountTab[] = ["all", "chequing", "savings", "credit-cards", "debts", "investments", "other"];

function tabForAccountType(accountType: string): AccountTab {
  if (accountType === "chequing" || accountType === "checking") return "chequing";
  if (accountType === "savings") return "savings";
  if (accountType === "credit-card") return "credit-cards";
  if (DEBT_ACCOUNT_TYPES.has(accountType)) return "debts";
  if (INVESTMENT_TYPES.has(accountType)) return "investments";
  return "other";
}

// Renders paginated transaction list with account-type tabs and trend chart
export default function Transactions() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<CategoryMajor[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashFlow, setCashFlow] = useState<{ month: string; income: number; expenses: number; net: number }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<"page" | "filtered">("page");
  const [currentPage, setCurrentPage] = useState(1);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<Transaction[][]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AccountTab>("all");
  const [activeAccountId, setActiveAccountId] = useState<string>(ALL_ACCOUNTS);
  const [columnFilters, setColumnFilters] = useState<Record<FilterKey, Set<string>>>({
    date: new Set(),
    description: new Set(),
    category: new Set(),
    account: new Set(),
    type: new Set()
  });
  const [formData, setFormData] = useState({
    accountId: "",
    type: "expense" as "income" | "expense" | "transfer",
    amount: "",
    category: "",
    description: "",
    date: new Date().toISOString().split("T")[0]
  });

  useEffect(() => {
    loadData();
  }, []);

  // Refresh on window focus and after CSV import so stale data is never shown
  useEffect(() => {
    const refresh = () => loadData();
    window.addEventListener("focus", refresh);
    window.addEventListener("transactions-imported", refresh as EventListener);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("transactions-imported", refresh as EventListener);
    };
  }, []);

  const loadData = async () => {
    try {
      const [txns, accts] = await Promise.all([api("/transactions"), api("/accounts")]);
      setTransactions(txns);
      setAccounts(accts);
      api("/analytics/cash-flow-history?months=12").then(setCashFlow).catch(() => {});
      try {
        const categoriesData = await api("/categories/tree");
        const resolvedCategories = Array.isArray(categoriesData?.majorCategories)
          ? categoriesData.majorCategories
          : Array.isArray(categoriesData)
            ? categoriesData
            : [];
        setCategories(resolvedCategories.length > 0 ? resolvedCategories : CATEGORY_CATALOG);
      } catch {
        setCategories(CATEGORY_CATALOG);
      }
      setCurrentPage(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load transactions";
      console.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount)
        })
      });
      setShowForm(false);
      setFormData({
        accountId: "",
        type: "expense",
        amount: "",
        category: "",
        description: "",
        date: new Date().toISOString().split("T")[0]
      });
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add transaction";
      alert(message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await api(`/transactions/${id}`, { method: "DELETE" });
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete transaction";
      alert(message);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete ALL transactions? This cannot be undone.")) return;
    try {
      await api("/transactions", { method: "DELETE" });
      loadData();
      alert("All transactions have been deleted");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete all transactions";
      alert(message);
    }
  };

  const accountNameById = accounts.reduce<Record<string, string>>((acc, account) => {
    acc[account._id] = account.name;
    return acc;
  }, {});

  const accountById = accounts.reduce<Record<string, Account>>((acc, account) => {
    acc[account._id] = account;
    return acc;
  }, {});

  const transactionFieldValue = (txn: Transaction, key: FilterKey): string => {
    if (key === "date") return format(new Date(txn.date), "yyyy-MM-dd");
    if (key === "description") return txn.description?.trim() || "-";
    if (key === "category") return txn.category?.trim() || "Uncategorized";
    if (key === "account") return accountNameById[txn.accountId] || "Unknown";
    return txn.type;
  };

  const typeFilteredTransactions = transactions.filter((txn) => {
    if (activeTab === "all") return true;
    const account = accountById[txn.accountId];
    if (!account) return activeTab === "other";
    return tabForAccountType(account.type as string) === activeTab;
  });

  const accountTabs = accounts
    .filter((account) => activeTab === "all" || tabForAccountType(account.type as string) === activeTab)
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    const validAccountIds = new Set(accountTabs.map((account) => account._id));
    if (activeAccountId !== ALL_ACCOUNTS && !validAccountIds.has(activeAccountId)) {
      setActiveAccountId(ALL_ACCOUNTS);
    }
  }, [accountTabs, activeAccountId]);

  const accountFilteredTransactions =
    activeAccountId === ALL_ACCOUNTS
      ? typeFilteredTransactions
      : typeFilteredTransactions.filter((txn) => txn.accountId === activeAccountId);

  const tabCounts = tabs.reduce<Record<AccountTab, number>>((acc, tab) => {
    if (tab === "all") {
      acc[tab] = transactions.length;
      return acc;
    }

    acc[tab] = transactions.filter((txn) => {
      const account = accountById[txn.accountId];
      if (!account) return tab === "other";
      return tabForAccountType(account.type as string) === tab;
    }).length;

    return acc;
  }, {
    all: 0,
    chequing: 0,
    savings: 0,
    "credit-cards": 0,
    debts: 0,
    investments: 0,
    other: 0
  });

  const accountCounts = accountTabs.reduce<Record<string, number>>((acc, account) => {
    acc[account._id] = typeFilteredTransactions.filter((txn) => txn.accountId === account._id).length;
    return acc;
  }, {});

  const filteredTransactions = accountFilteredTransactions.filter((txn) =>
    (Object.keys(columnFilters) as FilterKey[]).every((key) => {
      const selectedValues = columnFilters[key];
      if (selectedValues.size === 0) return true;
      return selectedValues.has(transactionFieldValue(txn, key));
    })
  );

  const selectedAccountName = activeAccountId === ALL_ACCOUNTS ? null : accountNameById[activeAccountId] || "Unknown";

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);
  const filteredIds = filteredTransactions.map((txn) => txn._id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedTransactions.has(id));
  const allPageSelected =
    paginatedTransactions.length > 0 && paginatedTransactions.every((t) => selectedTransactions.has(t._id));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const visibleIds = new Set(filteredTransactions.map((txn) => txn._id));
    setSelectedTransactions((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredTransactions]);

  useEffect(() => {
    setColumnFilters((prev) => {
      let changed = false;
      const next: Record<FilterKey, Set<string>> = {
        date: new Set(),
        description: new Set(),
        category: new Set(),
        account: new Set(),
        type: new Set()
      };

      (Object.keys(prev) as FilterKey[]).forEach((key) => {
        const validValues = new Set(accountFilteredTransactions.map((txn) => transactionFieldValue(txn, key)));
        const kept = new Set(Array.from(prev[key]).filter((value) => validValues.has(value)));
        next[key] = kept;
        if (kept.size !== prev[key].size) {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [accountFilteredTransactions, accounts]);

  useEffect(() => {
    setCurrentPage(1);
    setActiveAccountId(ALL_ACCOUNTS);
  }, [activeTab]);

  const handleDeleteSelected = async () => {
    const selectedArray = Array.from(selectedTransactions);
    const isAllSelected = selectedArray.length === filteredTransactions.length;
    const confirmMessage = isAllSelected
      ? `Delete all ${selectedArray.length} transactions? This cannot be undone.`
      : `Delete ${selectedArray.length} selected transaction(s)? This cannot be undone.`;

    if (!confirm(confirmMessage)) return;

    try {
      await api("/transactions", {
        method: "DELETE",
        body: JSON.stringify({ ids: selectedArray })
      });
      loadData();
      setSelectedTransactions(new Set());
      alert(`${selectedArray.length} transaction(s) deleted successfully`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete selected transactions";
      alert(message);
    }
  };

  const handleSelectTransaction = (id: string) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTransactions(newSelected);
  };

  const handleSelectAll = () => {
    const visibleIds = paginatedTransactions.map((t) => t._id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedTransactions.has(id));

    const newSelected = new Set(selectedTransactions);
    if (allVisibleSelected) {
      visibleIds.forEach((id) => newSelected.delete(id));
    } else {
      visibleIds.forEach((id) => newSelected.add(id));
    }
    setSelectedTransactions(newSelected);
  };

  const handleSelectAllFiltered = () => {
    const newSelected = new Set(selectedTransactions);
    if (allFilteredSelected) {
      filteredIds.forEach((id) => newSelected.delete(id));
    } else {
      filteredIds.forEach((id) => newSelected.add(id));
    }
    setSelectedTransactions(newSelected);
  };

  const handleClearSelection = () => {
    setSelectedTransactions(new Set());
  };

  const handleDeleteFiltered = async () => {
    if (filteredTransactions.length === 0) return;
    if (!confirm(`Delete all ${filteredTransactions.length} filtered transaction(s)? This cannot be undone.`)) return;

    try {
      await api("/transactions", {
        method: "DELETE",
        body: JSON.stringify({ ids: filteredIds })
      });
      await loadData();
      setSelectedTransactions(new Set());
      alert(`${filteredTransactions.length} filtered transaction(s) deleted successfully`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete filtered transactions";
      alert(message);
    }
  };

  const handleFindDuplicates = async () => {
    if (!selectedAccount) {
      alert("Please select an account to find duplicates for");
      return;
    }

    try {
      const result = await api(`/import/duplicates/${selectedAccount}`);
      setDuplicateGroups(result.duplicateGroups || []);
      setShowDuplicates(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to find duplicates";
      alert("Failed to find duplicates: " + message);
    }
  };

  const handleDeleteDuplicate = async (id: string) => {
    if (!confirm("Delete this duplicate transaction?")) return;
    try {
      await api(`/transactions/${id}`, { method: "DELETE" });
      if (selectedAccount) {
        const result = await api(`/import/duplicates/${selectedAccount}`);
        setDuplicateGroups(result.duplicateGroups || []);
      }
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete transaction";
      alert("Failed to delete transaction: " + message);
    }
  };

  const handleDeleteAllDuplicates = async () => {
    const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.length, 0);
    if (!confirm(`Delete all ${totalDuplicates} duplicate transactions? This cannot be undone.`)) return;

    try {
      for (const group of duplicateGroups) {
        for (let i = 1; i < group.length; i++) {
          await api(`/transactions/${group[i]._id}`, { method: "DELETE" });
        }
      }
      setDuplicateGroups([]);
      setShowDuplicates(false);
      loadData();
      alert("All duplicates have been deleted");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete duplicates";
      alert("Failed to delete duplicates: " + message);
    }
  };

  const getFilterOptions = (key: FilterKey): string[] => {
    const options = new Set<string>();
    accountFilteredTransactions.forEach((txn) => options.add(transactionFieldValue(txn, key)));
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  };

  const toggleFilterValue = (key: FilterKey, value: string) => {
    setColumnFilters((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...prev, [key]: next };
    });
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setColumnFilters({
      date: new Set(),
      description: new Set(),
      category: new Set(),
      account: new Set(),
      type: new Set()
    });
    setCurrentPage(1);
  };

  const activeFilterCount = Object.values(columnFilters).reduce((count, set) => count + set.size, 0);

  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPreviousPage = () => setCurrentPage((prev) => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage((prev) => Math.min(totalPages, prev + 1));

  const renderFilterDropdown = (label: string, key: FilterKey) => {
    const options = getFilterOptions(key);
    const selectedValues = columnFilters[key];

    return (
      <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--text-light)" }}>{label}</span>
        <details>
          <summary style={{ cursor: "pointer", userSelect: "none", fontSize: "0.78rem", padding: "0.25rem 0.4rem", border: "1px solid var(--border)", borderRadius: "0.35rem", background: "var(--bg-card)", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{selectedValues.size > 0 ? `${selectedValues.size} selected` : "All"}</span>
            <span style={{ fontSize: "0.6rem", opacity: 0.6 }}>▼</span>
          </summary>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              marginTop: "0.5rem",
              maxHeight: "180px",
              overflowY: "auto",
              padding: "0.5rem",
              background: "var(--bg)"
            }}
          >
            {options.map((value) => (
              <label
                key={`${key}-${value}`}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}
              >
                <input
                  type="checkbox"
                  checked={selectedValues.has(value)}
                  onChange={() => toggleFilterValue(key, value)}
                />
                <span>{value}</span>
              </label>
            ))}
            {options.length === 0 && <div style={{ color: "var(--text-light)" }}>No values</div>}
          </div>
        </details>
      </label>
    );
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Transactions</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Add Transaction"}</button>
          <button onClick={() => setShowDuplicates(!showDuplicates)} className="btn-secondary">
            Find Duplicates
          </button>
          {selectedTransactions.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="btn-danger"
              style={{ padding: "0.625rem 1.25rem", fontSize: "0.875rem" }}
            >
              Delete Selected ({selectedTransactions.size})
            </button>
          )}
          {filteredTransactions.length > 0 && (
            <button onClick={handleSelectAllFiltered} className="btn-secondary">
              {allFilteredSelected ? "Unselect All Filtered" : `Select All Filtered (${filteredTransactions.length})`}
            </button>
          )}
          {selectedTransactions.size > 0 && (
            <button onClick={handleClearSelection} className="btn-secondary">
              Clear Selection
            </button>
          )}
          {activeFilterCount > 0 && filteredTransactions.length > 0 && (
            <button onClick={handleDeleteFiltered} className="btn-danger">
              Delete Filtered ({filteredTransactions.length})
            </button>
          )}
          {transactions.length > 0 && (
            <button onClick={handleDeleteAll} className="btn-danger">
              Delete All
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="card form-card">
          <h3>New Transaction</h3>
          <form onSubmit={handleSubmit}>
            <select value={formData.accountId} onChange={(e) => setFormData({ ...formData, accountId: e.target.value })} required>
              <option value="">Select Account</option>
              {accounts.map((acc) => {
                const typeLabels: { [key: string]: string } = {
                  chequing: "Chequing",
                  savings: "Savings",
                  "credit-card": "Credit Card",
                  tfsa: "TFSA",
                  rrsp: "RRSP",
                  gic: "GIC",
                  "line-of-credit": "LOC",
                  "student-loan": "Student Loan",
                  mortgage: "Mortgage",
                  "auto-loan": "Auto Loan",
                  "personal-loan": "Personal Loan",
                  investment: "Investment",
                  other: "Other"
                };
                const typeLabel = typeLabels[acc.type] || acc.type;
                return (
                  <option key={acc._id} value={acc._id}>
                    {acc.name} ({typeLabel})
                  </option>
                );
              })}
            </select>

            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as "income" | "expense" | "transfer" })}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>

            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />

            <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
              <option value="">Select Subcategory (optional)</option>
              {categories.map((major) => (
                <optgroup key={major.key} label={major.name}>
                  {major.subcategories.map((sub) => (
                    <option key={sub.key} value={sub.name}>
                      {sub.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <input
              type="text"
              placeholder="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />

            <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />

            <button type="submit">Add Transaction</button>
          </form>
        </div>
      )}

      {showDuplicates && (
        <div className="card">
          <h3>Find & Delete Duplicate Transactions</h3>
          <label style={{ marginBottom: "1rem", display: "block" }}>
            Select Account to Check for Duplicates:
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} style={{ marginTop: "0.5rem" }}>
              <option value="">-- All Accounts --</option>
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={handleFindDuplicates} className="btn-primary" style={{ marginRight: "0.5rem" }}>
            Search for Duplicates
          </button>
          <button
            onClick={() => {
              setShowDuplicates(false);
              setDuplicateGroups([]);
            }}
            className="btn-secondary"
          >
            Close
          </button>

          {duplicateGroups.length > 0 && (
            <div style={{ marginTop: "2rem" }}>
              <p style={{ fontSize: "1.1rem", fontWeight: "bold" }}>
                Found {duplicateGroups.length} group(s) of duplicates ({duplicateGroups.reduce((sum, g) => sum + g.length, 0)} total
                transactions)
              </p>
              <button onClick={handleDeleteAllDuplicates} className="btn-danger" style={{ marginBottom: "1rem" }}>
                Delete All Duplicates (Keep First)
              </button>

              {duplicateGroups.map((group, groupIdx) => (
                <div
                  key={groupIdx}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    padding: "1rem",
                    marginBottom: "1rem",
                    backgroundColor: "#fff9e6"
                  }}
                >
                  <p style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>
                    Duplicate Group {groupIdx + 1} - {group[0].description} ({fmtMoney(group[0].amount)})
                  </p>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #ddd" }}>
                        <th style={{ textAlign: "left", padding: "0.5rem" }}>Date</th>
                        <th style={{ textAlign: "left", padding: "0.5rem" }}>Description</th>
                        <th style={{ textAlign: "left", padding: "0.5rem" }}>Amount</th>
                        <th style={{ textAlign: "left", padding: "0.5rem" }}>Category</th>
                        <th style={{ textAlign: "center", padding: "0.5rem" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((tx, idx) => (
                        <tr
                          key={tx._id}
                          style={{
                            backgroundColor: idx === 0 ? "#e6f9e6" : "#fff",
                            borderBottom: "1px solid #eee"
                          }}
                        >
                          <td style={{ padding: "0.5rem" }}>
                            {format(new Date(tx.date), "MMM d, yyyy")}
                            {idx === 0 && (
                              <span style={{ marginLeft: "0.5rem", color: "green", fontWeight: "bold" }}>(KEPT)</span>
                            )}
                          </td>
                          <td style={{ padding: "0.5rem" }}>{tx.description}</td>
                          <td style={{ padding: "0.5rem" }}>{fmtMoney(tx.amount)}</td>
                          <td style={{ padding: "0.5rem" }}>{tx.category || "-"}</td>
                          <td style={{ textAlign: "center", padding: "0.5rem" }}>
                            {idx > 0 && (
                              <button
                                onClick={() => handleDeleteDuplicate(tx._id)}
                                className="btn-danger"
                                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {duplicateGroups.length === 0 && selectedAccount && (
            <p style={{ marginTop: "1rem", color: "#666" }}>No duplicates found for this account!</p>
          )}
        </div>
      )}

      {cashFlow.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ margin: "0 0 0.75rem 0" }}>12-Month Cash Flow</h3>
          <TrendAreaChart
            data={cashFlow}
            xKey="month"
            series={[
              { key: "income",   label: "Income",   color: "#10B981" },
              { key: "expenses", label: "Expenses",  color: "#EF4444" },
              { key: "net",      label: "Net",       color: "#6366F1", dashed: true },
            ]}
            height={200}
          />
        </div>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ margin: "0 0 0.75rem 0" }}>Account Type Tabs</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          {tabs.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={isActive ? "btn-primary" : "btn-secondary"}
              >
                {tabLabel[tab]} ({tabCounts[tab]})
              </button>
            );
          })}
        </div>

        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Account Tabs</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveAccountId(ALL_ACCOUNTS)}
            className={activeAccountId === ALL_ACCOUNTS ? "btn-primary" : "btn-secondary"}
          >
            {activeTab === "all" ? "All Accounts" : `All ${tabLabel[activeTab]}`} ({typeFilteredTransactions.length})
          </button>
          {accountTabs.map((account) => (
            <button
              key={account._id}
              type="button"
              onClick={() => setActiveAccountId(account._id)}
              className={activeAccountId === account._id ? "btn-primary" : "btn-secondary"}
            >
              {account.name} ({accountCounts[account._id] ?? 0})
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>Column Filters</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {activeFilterCount > 0 && <span style={{ color: "var(--text-light)" }}>{activeFilterCount} active</span>}
            <button onClick={clearAllFilters} className="btn-secondary" disabled={activeFilterCount === 0}>
              Clear Filters
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
          {renderFilterDropdown("Date", "date")}
          {renderFilterDropdown("Description", "description")}
          {renderFilterDropdown("Category", "category")}
          {renderFilterDropdown("Account", "account")}
          {renderFilterDropdown("Type", "type")}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <strong>
            Showing {tabLabel[activeTab]} {selectedAccountName ? `| ${selectedAccountName}` : ""} transactions: {filteredTransactions.length}
          </strong>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
            Selection Mode:
            <select
              value={selectionMode}
              onChange={(e) => setSelectionMode(e.target.value as "page" | "filtered")}
            >
              <option value="page">Page Only</option>
              <option value="filtered">All Filtered</option>
            </select>
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: "40px" }}>
                <input
                  type="checkbox"
                  checked={selectionMode === "page" ? allPageSelected : allFilteredSelected}
                  onChange={selectionMode === "page" ? handleSelectAll : handleSelectAllFiltered}
                />
              </th>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Account</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransactions.map((txn) => {
              const account = accounts.find((a) => a._id === txn.accountId);
              const isSelected = selectedTransactions.has(txn._id);
              return (
                <tr key={txn._id} style={{ backgroundColor: isSelected ? "#f0f0f0" : "transparent" }}>
                  <td style={{ width: "40px" }}>
                    <input type="checkbox" checked={isSelected} onChange={() => handleSelectTransaction(txn._id)} />
                  </td>
                  <td>{format(new Date(txn.date), "MMM d, yyyy")}</td>
                  <td>{txn.description || "-"}</td>
                  <td>{txn.category || "Uncategorized"}</td>
                  <td>{account?.name || "Unknown"}</td>
                  <td>
                    <span className={`badge ${txn.type}`}>{txn.type}</span>
                  </td>
                  <td className={txn.type === "expense" ? "negative" : "positive"}>
                    {txn.type === "expense" ? "−" : "+"}{fmtMoney(txn.amount)}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => navigate(`/transactions/${txn._id}`)} className="btn-primary btn-sm">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(txn._id)} className="btn-danger btn-sm">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredTransactions.length === 0 && <p className="empty-state">No transactions match current tab/filters</p>}

        {filteredTransactions.length > 0 && (
          <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={goToFirstPage} disabled={currentPage === 1} className="btn-secondary">
                First Page
              </button>
              <button onClick={goToPreviousPage} disabled={currentPage === 1} className="btn-secondary">
                Previous
              </button>
              <button onClick={goToNextPage} disabled={currentPage === totalPages} className="btn-secondary">
                Next
              </button>
              <button onClick={goToLastPage} disabled={currentPage === totalPages} className="btn-secondary">
                Last Page
              </button>
            </div>
            <div style={{ color: "var(--text-light)", fontSize: "0.875rem" }}>
              <div>
                Page {currentPage} of {totalPages} | Showing {startIndex + 1} - {Math.min(endIndex, filteredTransactions.length)} of{" "}
                {filteredTransactions.length}
              </div>
              {selectedTransactions.size > 0 && (
                <div style={{ marginTop: "0.5rem", color: "var(--primary)", fontWeight: "500" }}>
                  {selectedTransactions.size} transaction(s) selected
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}













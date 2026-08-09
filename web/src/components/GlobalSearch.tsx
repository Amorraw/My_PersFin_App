// Cmd+K spotlight-style modal for navigating to any page by name
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const PAGES = [
  { label: "Dashboard",               path: "/",                        icon: "🏠" },
  { label: "Accounts",                path: "/accounts",                icon: "🏦" },
  { label: "Transactions",            path: "/transactions",            icon: "💳" },
  { label: "Budgets",                 path: "/budgets",                 icon: "📊" },
  { label: "Debts",                   path: "/debts",                   icon: "💰" },
  { label: "Debt Optimization",       path: "/debt-optimization",       icon: "⚡" },
  { label: "Goals",                   path: "/goals",                   icon: "🎯" },
  { label: "Net Worth",               path: "/net-worth",               icon: "📈" },
  { label: "Properties",             path: "/properties",              icon: "🏠" },
  { label: "Bills",                   path: "/bills",                   icon: "📄" },
  { label: "Investments",             path: "/investment-recommendations", icon: "📊" },
  { label: "Portfolio Rebalancing",   path: "/portfolio-rebalancing",   icon: "⚖️" },
  { label: "Investment Performance",  path: "/investment-performance",  icon: "📉" },
  { label: "ETF Portfolios",          path: "/etf-portfolios",          icon: "📦" },
  { label: "GIC Tracker",            path: "/gic-tracker",             icon: "🏛️" },
  { label: "Insurance Planning",      path: "/insurance-planning",      icon: "🛡️" },
  { label: "Paycheck Calculator",     path: "/paycheck-calculator",     icon: "💵" },
  { label: "Income Types",            path: "/income-types",            icon: "🧾" },
  { label: "Inflation Tracker",       path: "/inflation-tracker",       icon: "📊" },
  { label: "Financial Planning",      path: "/financial-planning",      icon: "🗺️" },
  { label: "Tax Planning",            path: "/tax-planning",            icon: "📋" },
  { label: "RRSP vs TFSA",           path: "/rrsp-vs-tfsa",            icon: "🔄" },
  { label: "TFSA Room",              path: "/tfsa-room",               icon: "🏦" },
  { label: "Retirement Projector",    path: "/retirement",              icon: "🌅" },
  { label: "Spending Heatmap",        path: "/spending-heatmap",        icon: "🗓️" },
  { label: "Recurring Transactions",  path: "/recurring",               icon: "🔁" },
  { label: "Annual Review",           path: "/annual-review",           icon: "✅" },
  { label: "Reports & Export",        path: "/reports",                 icon: "📑" },
  { label: "Notifications",          path: "/notifications",           icon: "🔔" },
  { label: "Import CSV",             path: "/import",                  icon: "⬆️" },
  { label: "Settings",               path: "/settings",                icon: "⚙️" },
];

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

// Filters PAGES by query and supports keyboard arrow/enter navigation
export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Show first 8 pages as recents when query is empty; filter by label otherwise
  const results = query.trim()
    ? PAGES.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES.slice(0, 8);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) go(results[selected].path);
    if (e.key === "Escape") onClose();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "flex-start", justifyContent: "center", paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 560,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 18, color: "var(--text-light)" }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search pages…"
            style={{
              flex: 1, border: "none", background: "none", fontSize: 16,
              color: "var(--text)", outline: "none", padding: 0, margin: 0,
            }}
          />
          <kbd style={{ fontSize: 11, color: "var(--text-light)", background: "var(--bg)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)" }}>Esc</kbd>
        </div>

        <div style={{ maxHeight: 380, overflowY: "auto", padding: "6px 0" }}>
          {results.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-light)", fontSize: 14 }}>No pages match "{query}"</div>
          ) : (
            results.map((r, i) => (
              <div
                key={r.path}
                onClick={() => go(r.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                  cursor: "pointer",
                  background: i === selected ? "var(--bg)" : "transparent",
                  color: "var(--text)",
                }}
                onMouseEnter={() => setSelected(i)}
              >
                <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{r.icon}</span>
                <span style={{ fontSize: 14, fontWeight: i === selected ? 600 : 400 }}>{r.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-light)", fontFamily: "monospace" }}>{r.path}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 16, fontSize: 11, color: "var(--text-light)" }}>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}

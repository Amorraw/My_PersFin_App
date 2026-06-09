// Root app shell: providers, collapsible sidebar nav, and all page routes
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import GlobalSearch from "./components/GlobalSearch";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import TransactionDetail from "./pages/TransactionDetail";
import Budgets from "./pages/Budgets";
import Debts from "./pages/Debts";
import Accounts from "./pages/Accounts";
import Import from "./pages/Import";
import { TaxPlanning } from "./pages/TaxPlanning";
import DebtOptimization from "./pages/DebtOptimization";
import InvestmentRecommendations from "./pages/InvestmentRecommendations";
import FinancialPlanning from "./pages/FinancialPlanning";
import Goals from "./pages/Goals";
import Bills from "./pages/Bills";
import NetWorth from "./pages/NetWorth";
import Settings from "./pages/Settings";
import Properties from "./pages/Properties";
import RRSPvsTFSA from "./pages/RRSPvsTFSA";
import TFSARoom from "./pages/TFSARoom";
import TFSATracker from "./pages/TFSATracker";
import RRSPTracker from "./pages/RRSPTracker";
import GICTracker from "./pages/GICTracker";
import FHSATracker from "./pages/FHSATracker";
import RESPTracker from "./pages/RESPTracker";
import PortfolioRebalancing from "./pages/PortfolioRebalancing";
import ETFModelPortfolios from "./pages/ETFModelPortfolios";
import InvestmentPerformanceDashboard from "./pages/InvestmentPerformanceDashboard";
import InsurancePlanning from "./pages/InsurancePlanning";
import PaycheckCalculator from "./pages/PaycheckCalculator";
import CanadianIncomeTypes from "./pages/CanadianIncomeTypes";
import InflationTracker from "./pages/InflationTracker";
import Notifications from "./pages/Notifications";
import Reports from "./pages/Reports";
import RetirementProjector from "./pages/RetirementProjector";
import SpendingHeatmap from "./pages/SpendingHeatmap";
import RecurringTransactions from "./pages/RecurringTransactions";
import AnnualReview from "./pages/AnnualReview";
import BankConnections from "./pages/BankConnections";
import MLInsights from "./pages/MLInsights";
import DemoProfiles from "./pages/DemoProfiles";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Header from "./components/Header";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";

// ── Navigation structure ──────────────────────────────
// Grouped sidebar links — order here matches the rendered sidebar
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/",           label: "Dashboard" },
      { to: "/net-worth",  label: "Net Worth"  },
    ],
  },
  {
    label: "Cash Flow",
    items: [
      { to: "/accounts",            label: "Accounts"         },
      { to: "/transactions",        label: "Transactions"     },
      { to: "/budgets",             label: "Budgets"          },
      { to: "/bills",               label: "Bills"            },
      { to: "/recurring",           label: "Recurring"        },
      { to: "/spending-heatmap",    label: "Spending Heatmap" },
      { to: "/paycheck-calculator", label: "Paycheck Calc"    },
    ],
  },
  {
    label: "Debt",
    items: [
      { to: "/debts",             label: "Debts"            },
      { to: "/debt-optimization", label: "Debt Optimization"},
    ],
  },
  {
    label: "Goals & Savings",
    items: [
      { to: "/goals",         label: "Goals"         },
      { to: "/annual-review", label: "Annual Review" },
    ],
  },
  {
    label: "Investments",
    items: [
      { to: "/investment-recommendations", label: "Recommendations" },
      { to: "/portfolio-rebalancing",      label: "Rebalancing"     },
      { to: "/investment-performance",     label: "Performance"     },
      { to: "/etf-portfolios",             label: "ETF Portfolios"  },
      { to: "/gic-tracker",                label: "GIC Tracker"     },
      { to: "/properties",                 label: "Properties"      },
      { to: "/fhsa-tracker",               label: "🏠 FHSA"         },
      { to: "/resp-tracker",               label: "🎓 RESP"         },
    ],
  },
  {
    label: "Tax & Registered",
    items: [
      { to: "/tax-planning",   label: "Tax Planning"   },
      { to: "/rrsp-vs-tfsa",   label: "RRSP vs TFSA"   },
      { to: "/tfsa-room",      label: "TFSA Room Calc"  },
      { to: "/tfsa-tracker",   label: "💰 TFSA Tracker" },
      { to: "/rrsp-tracker",   label: "📈 RRSP Tracker" },
      { to: "/income-types",   label: "Income Types"   },
    ],
  },
  {
    label: "Insurance",
    items: [
      { to: "/insurance-planning", label: "Insurance Planning" },
    ],
  },
  {
    label: "Retirement & Planning",
    items: [
      { to: "/retirement",        label: "Retirement Projector" },
      { to: "/financial-planning",label: "Financial Planning"   },
      { to: "/inflation-tracker", label: "Inflation Tracker"    },
    ],
  },
  {
    label: "Reports & Tools",
    items: [
      { to: "/reports",          label: "Reports & Export"  },
      { to: "/import",           label: "Import"            },
      { to: "/bank-connections", label: "Bank Connections"  },
    ],
  },
  {
    label: "AI Insights",
    items: [
      { to: "/ml-insights", label: "ML Insights" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/notifications",  label: "Notifications"   },
      { to: "/settings",       label: "Settings"        },
      { to: "/demo-profiles",  label: "Demo Profiles"   },
    ],
  },
];

// ── Sidebar collapse helpers ──────────────────────────
/** Returns the group label that owns the given pathname, or null. */
function activeGroupFor(pathname: string): string | null {
  return NAV_GROUPS.find(g =>
    g.items.some(item =>
      item.to === "/"
        ? pathname === "/"
        : pathname === item.to || pathname.startsWith(item.to + "/")
    )
  )?.label ?? null;
}

/** Builds a collapsed map: every group true (collapsed) except the active one. */
function buildCollapsed(pathname: string): Record<string, boolean> {
  const active = activeGroupFor(pathname);
  const map: Record<string, boolean> = {};
  NAV_GROUPS.forEach(g => { map[g.label] = g.label !== active; });
  return map;
}

// ── Layout ────────────────────────────────────────────
// Renders authenticated shell: sidebar, header, and routed content area
function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // All groups collapsed on mount except the one owning the current route
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    () => buildCollapsed(location.pathname)
  );

  const toggleGroup = (label: string) =>
    setCollapsed(c => ({ ...c, [label]: !c[label] }));

  // On every navigation: collapse all groups, expand only the active one
  useEffect(() => {
    setCollapsed(buildCollapsed(location.pathname));
  }, [location.pathname]);

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Global keyboard shortcut: Cmd/Ctrl+K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/demo-profiles" element={<DemoProfiles />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Header onSearchOpen={() => setSearchOpen(true)} onMenuToggle={() => setMobileOpen((o) => !o)} />

      <div className="app-container">
        <nav className={`sidebar${mobileOpen ? " mobile-open" : ""}`}>
          {NAV_GROUPS.map(group => {
            const isCollapsed = !!collapsed[group.label];
            return (
              <div key={group.label} className="sidebar-group">
                <button
                  className="sidebar-group-header"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={!isCollapsed}
                >
                  <span>{group.label}</span>
                  <span className={`sidebar-chevron${isCollapsed ? "" : " open"}`}>›</span>
                </button>
                {!isCollapsed && (
                  <ul>
                    {group.items.map(({ to, label }) => (
                      <li key={to}>
                        <NavLink
                          to={to}
                          end={to === "/"}
                          className={({ isActive }) => isActive ? "active" : ""}
                        >
                          {label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="content-panel">
          <main className="main-content">
            <ErrorBoundary key={location.key}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/transactions/:id" element={<TransactionDetail />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/debts" element={<Debts />} />
                <Route path="/debt-optimization" element={<DebtOptimization />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/net-worth" element={<NetWorth />} />
                <Route path="/bills" element={<Bills />} />
                <Route path="/recurring" element={<RecurringTransactions />} />
                <Route path="/investment-recommendations" element={<InvestmentRecommendations />} />
                <Route path="/financial-planning" element={<FinancialPlanning />} />
                <Route path="/tax-planning" element={<TaxPlanning />} />
                <Route path="/import" element={<Import />} />
                <Route path="/properties" element={<Properties />} />
                <Route path="/rrsp-vs-tfsa" element={<RRSPvsTFSA />} />
                <Route path="/tfsa-room" element={<TFSARoom />} />
                <Route path="/tfsa-tracker" element={<TFSATracker />} />
                <Route path="/rrsp-tracker" element={<RRSPTracker />} />
                <Route path="/gic-tracker" element={<GICTracker />} />
                <Route path="/fhsa-tracker" element={<FHSATracker />} />
                <Route path="/resp-tracker" element={<RESPTracker />} />
                <Route path="/portfolio-rebalancing" element={<PortfolioRebalancing />} />
                <Route path="/etf-portfolios" element={<ETFModelPortfolios />} />
                <Route path="/investment-performance" element={<InvestmentPerformanceDashboard />} />
                <Route path="/insurance-planning" element={<InsurancePlanning />} />
                <Route path="/paycheck-calculator" element={<PaycheckCalculator />} />
                <Route path="/income-types" element={<CanadianIncomeTypes />} />
                <Route path="/inflation-tracker" element={<InflationTracker />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/retirement" element={<RetirementProjector />} />
                <Route path="/spending-heatmap" element={<SpendingHeatmap />} />
                <Route path="/annual-review" element={<AnnualReview />} />
                <Route path="/bank-connections" element={<BankConnections />} />
                <Route path="/ml-insights" element={<MLInsights />} />
                <Route path="/demo-profiles" element={<DemoProfiles />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}

// Wraps the app in all context providers and the router
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Layout />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;

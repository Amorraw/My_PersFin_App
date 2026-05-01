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
import GICTracker from "./pages/GICTracker";
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
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Header from "./components/Header";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";

const NAV = [
  { to: "/",                        label: "Dashboard" },
  { to: "/accounts",                label: "Accounts" },
  { to: "/transactions",            label: "Transactions" },
  { to: "/budgets",                 label: "Budgets" },
  { to: "/debts",                   label: "Debts" },
  { to: "/debt-optimization",       label: "Debt Optimization" },
  { to: "/goals",                   label: "Goals" },
  { to: "/net-worth",               label: "Net Worth" },
  { to: "/properties",              label: "Properties" },
  { to: "/bills",                   label: "Bills" },
  { to: "/recurring",               label: "Recurring" },
  { to: "/investment-recommendations", label: "Investments" },
  { to: "/portfolio-rebalancing",   label: "Rebalancing" },
  { to: "/investment-performance",  label: "Performance" },
  { to: "/etf-portfolios",          label: "ETF Portfolios" },
  { to: "/gic-tracker",             label: "GIC Tracker" },
  { to: "/insurance-planning",      label: "Insurance" },
  { to: "/paycheck-calculator",     label: "Paycheck Calc" },
  { to: "/income-types",            label: "Income Types" },
  { to: "/inflation-tracker",       label: "Inflation Tracker" },
  { to: "/financial-planning",      label: "Financial Planning" },
  { to: "/tax-planning",            label: "Tax Planning" },
  { to: "/rrsp-vs-tfsa",            label: "RRSP vs TFSA" },
  { to: "/tfsa-room",               label: "TFSA Room" },
  { to: "/retirement",              label: "Retirement" },
  { to: "/spending-heatmap",        label: "Spending Heatmap" },
  { to: "/annual-review",           label: "Annual Review" },
  { to: "/reports",                 label: "Reports & Export" },
  { to: "/notifications",           label: "Notifications" },
  { to: "/bank-connections",         label: "Bank Connections" },
  { to: "/import",                  label: "Import CSV" },
  { to: "/settings",                label: "Settings" },
];

function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
          <ul>
            {NAV.map(({ to, label }) => (
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
                <Route path="/gic-tracker" element={<GICTracker />} />
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

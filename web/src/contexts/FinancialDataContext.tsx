import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import type { Debt, Goal, FinancialSnapshot, NetWorthCurrent } from "../types";
import { HIGH_INTEREST_DEBT_APR, emergencyFundStatus, type EmergencyFundStatus } from "../utils/financeRules";

interface FinancialDataContextType {
  snapshot: FinancialSnapshot | null;
  netWorth: NetWorthCurrent | null;
  debts: Debt[];
  goals: Goal[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // derived
  monthlySurplus: number;
  emergencyFundMonths: number;
  emergencyFundStatus: EmergencyFundStatus;
  hasHighInterestDebt: boolean;
  highInterestDebts: Debt[];
  totalDebtBalance: number;
  totalRecommendedMonthlyGoals: number;
  goalsOverCapacity: boolean;
}

const FinancialDataContext = createContext<FinancialDataContextType | undefined>(undefined);

export function FinancialDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthCurrent | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsCapacity, setGoalsCapacity] = useState({ totalRecommendedMonthly: 0, overCapacity: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snapshotData, netWorthData, debtsData, goalsData] = await Promise.all([
        api("/analytics/financial-snapshot"),
        api("/net-worth/current"),
        api("/debts"),
        api("/goals"),
      ]);
      setSnapshot(snapshotData);
      setNetWorth(netWorthData);
      setDebts(debtsData);
      setGoals(goalsData.goals ?? []);
      setGoalsCapacity({
        totalRecommendedMonthly: goalsData.totalRecommendedMonthly ?? 0,
        overCapacity: goalsData.overCapacity ?? false,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load financial data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      refresh();
    } else {
      setSnapshot(null);
      setNetWorth(null);
      setDebts([]);
      setGoals([]);
      setGoalsCapacity({ totalRecommendedMonthly: 0, overCapacity: false });
      setError(null);
    }
  }, [user, refresh]);

  const highInterestDebts = debts.filter((d) => d.interestRate >= HIGH_INTEREST_DEBT_APR);
  const totalDebtBalance = debts.reduce((s, d) => s + d.currentBalance, 0);
  const emergencyFundMonths = snapshot?.emergencyFundMonths ?? 0;

  const value: FinancialDataContextType = {
    snapshot,
    netWorth,
    debts,
    goals,
    loading,
    error,
    refresh,
    monthlySurplus: Math.max(0, snapshot?.monthlyCashFlow ?? 0),
    emergencyFundMonths,
    emergencyFundStatus: emergencyFundStatus(emergencyFundMonths),
    hasHighInterestDebt: highInterestDebts.length > 0,
    highInterestDebts,
    totalDebtBalance,
    totalRecommendedMonthlyGoals: goalsCapacity.totalRecommendedMonthly,
    goalsOverCapacity: goalsCapacity.overCapacity,
  };

  return <FinancialDataContext.Provider value={value}>{children}</FinancialDataContext.Provider>;
}

export function useFinancialData() {
  const context = useContext(FinancialDataContext);
  if (!context) {
    throw new Error("useFinancialData must be used within FinancialDataProvider");
  }
  return context;
}

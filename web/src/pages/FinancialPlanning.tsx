import { useState } from "react";
import type { ReactElement } from "react";
import { api } from "../api";
import "./FinancialPlanning.css";

interface RetirementData {
  retirementAge: number;
  projectedNetWorth: number;
  annualRetirementIncome: number;
  CPPMonthly: number;
  OASMonthly: number;
  EmployerPensionMonthly: number;
  PortfolioWithdrawalMonthly: number;
  yearsOfRetirement: number;
  successProbability: number;
}

interface EmergencyFundData {
  monthlyExpenses: number;
  targetAmount: number;
  currentAmount: number;
  monthsCovered: number;
  status: "underfunded" | "adequate" | "well-funded";
}

interface TrajectoryData {
  year: number;
  age: number;
  income: number;
  savings: number;
  netWorth: number;
}

export default function FinancialPlanning(): ReactElement {
  const [currentAge, setCurrentAge] = useState(35);
  const [retirementAge, setRetirementAge] = useState(65);
  const [currentIncome, setCurrentIncome] = useState(75000);
  const [currentSavings, setCurrentSavings] = useState(100000);
  const [monthlyContribution, setMonthlyContribution] = useState(1000);
  const [monthlyExpenses, setMonthlyExpenses] = useState(5000);
  const [desiredRetirementIncome, setDesiredRetirementIncome] = useState(60000);
  const [employerPensionMonthly, setEmployerPensionMonthly] = useState(0);
  const [loading, setLoading] = useState(false);

  const [retirement, setRetirement] = useState<RetirementData | null>(null);
  const [emergencyFund, setEmergencyFund] = useState<EmergencyFundData | null>(null);
  const [trajectory, setTrajectory] = useState<TrajectoryData[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  const generatePlan = async () => {
    setLoading(true);
    try {
      const response = await api("/financial-plans", {
        method: "POST",
        body: JSON.stringify({
          name: "Financial Plan",
          currentAge,
          retirementAge,
          currentIncome,
          currentSavings,
          monthlyContribution,
          monthlyExpenses,
          desiredRetirementIncome,
          employerPensionMonthly,
        }),
      });

      setRetirement(response.analysis.retirementProjection);
      setEmergencyFund(response.analysis.emergencyFund);
      setTrajectory(response.analysis.trajectory);
      setRecommendations(response.analysis.recommendations);
    } catch (err) {
      console.error(err);
      alert("Error generating financial plan");
    } finally {
      setLoading(false);
    }
  };

  const yearsToRetirement = retirementAge - currentAge;

  const statusColor = (status: string) => {
    switch (status) {
      case "well-funded":
        return "well-funded";
      case "adequate":
        return "adequate";
      case "underfunded":
        return "underfunded";
      default:
        return "";
    }
  };

  return (
    <div className="planning-container">
      <div className="planning-header">
        <h1>🎯 Financial Planning</h1>
        <p>Comprehensive retirement and financial readiness analysis</p>
      </div>

      <div className="planning-section">
        <h2>Step 1: Your Financial Details</h2>
        <div className="input-grid">
          <div className="input-group">
            <label>Current Age</label>
            <input
              type="number"
              value={currentAge}
              onChange={(e) => setCurrentAge(Number(e.target.value))}
              min="18"
              max="100"
            />
          </div>
          <div className="input-group">
            <label>Retirement Age</label>
            <input
              type="number"
              value={retirementAge}
              onChange={(e) => setRetirementAge(Number(e.target.value))}
              min={currentAge}
              max="100"
            />
            <small>{yearsToRetirement} years to retirement</small>
          </div>
          <div className="input-group">
            <label>Current Income (Annual)</label>
            <input
              type="number"
              value={currentIncome}
              onChange={(e) => setCurrentIncome(Number(e.target.value))}
              min="0"
            />
          </div>
          <div className="input-group">
            <label>Current Savings</label>
            <input
              type="number"
              value={currentSavings}
              onChange={(e) => setCurrentSavings(Number(e.target.value))}
              min="0"
            />
          </div>
          <div className="input-group">
            <label>Monthly Contribution</label>
            <input
              type="number"
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(Number(e.target.value))}
              min="0"
            />
          </div>
          <div className="input-group">
            <label>Monthly Expenses</label>
            <input
              type="number"
              value={monthlyExpenses}
              onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
              min="0"
            />
          </div>
          <div className="input-group">
            <label>Desired Retirement Income (Annual)</label>
            <input
              type="number"
              value={desiredRetirementIncome}
              onChange={(e) => setDesiredRetirementIncome(Number(e.target.value))}
              min="0"
            />
          </div>
          <div className="input-group">
            <label>Employer Pension (Monthly)</label>
            <input
              type="number"
              value={employerPensionMonthly}
              onChange={(e) => setEmployerPensionMonthly(Number(e.target.value))}
              min="0"
              placeholder="e.g., Gov't of BC Pension"
            />
            <small>Your guaranteed monthly pension income</small>
          </div>
        </div>
        <button onClick={generatePlan} disabled={loading} className="btn-primary">
          {loading ? "Analyzing..." : "📊 Generate Financial Plan"}
        </button>
      </div>

      {retirement && (
        <>
          <div className="planning-section results">
            <h2>Retirement Projection</h2>
            <div className="retirement-grid">
              <div className="stat-card">
                <span className="label">Projected Net Worth at {retirementAge}</span>
                <span className="value">
                  ${retirement.projectedNetWorth.toLocaleString()}
                </span>
              </div>
              <div className="stat-card">
                <span className="label">Projected Retirement Income</span>
                <span className="value">
                  ${(retirement.annualRetirementIncome / 12).toLocaleString()}/month
                </span>
              </div>
              <div className="stat-card">
                <span className={`label success-${retirement.successProbability >= 75 ? "high" : retirement.successProbability >= 50 ? "medium" : "low"}`}>
                  Success Probability
                </span>
                <span className={`value success-${retirement.successProbability >= 75 ? "high" : retirement.successProbability >= 50 ? "medium" : "low"}`}>
                  {retirement.successProbability}%
                </span>
              </div>
            </div>

            <div className="retirement-income">
              <h3>Retirement Income Breakdown</h3>
              <div className="income-sources">
                <div className="income-card">
                  <span className="label">CPP</span>
                  <span className="value">${retirement.CPPMonthly.toLocaleString()}/month</span>
                  <small>Canada Pension Plan</small>
                </div>
                <div className="income-card">
                  <span className="label">OAS</span>
                  <span className="value">${retirement.OASMonthly.toLocaleString()}/month</span>
                  <small>Old Age Security</small>
                </div>
                {retirement.EmployerPensionMonthly > 0 && (
                  <div className="income-card">
                    <span className="label">Employer Pension</span>
                    <span className="value">${retirement.EmployerPensionMonthly.toLocaleString()}/month</span>
                    <small>Government of BC Pension</small>
                  </div>
                )}
                <div className="income-card">
                  <span className="label">Portfolio Withdrawal</span>
                  <span className="value">
                    ${retirement.PortfolioWithdrawalMonthly.toLocaleString()}/month
                  </span>
                  <small>4% safe withdrawal rate</small>
                </div>
                <div className="income-card total">
                  <span className="label">Total Monthly Income</span>
                  <span className="value">
                    ${(
                      retirement.CPPMonthly +
                      retirement.OASMonthly +
                      retirement.EmployerPensionMonthly +
                      retirement.PortfolioWithdrawalMonthly
                    ).toLocaleString()}/month
                  </span>
                </div>
              </div>
            </div>
          </div>

          {emergencyFund && (
            <div className="planning-section">
              <h2>Emergency Fund Status</h2>
              <div className={`emergency-status ${statusColor(emergencyFund.status)}`}>
                <h3>{emergencyFund.status.toUpperCase().replace("-", " ")}</h3>
                <div className="emergency-details">
                  <div className="detail-item">
                    <span className="label">Current Amount</span>
                    <span className="value">$ {emergencyFund.currentAmount.toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Target Amount</span>
                    <span className="value">
                      ${emergencyFund.targetAmount.toLocaleString()}
                    </span>
                    <small>(6 months of expenses)</small>
                  </div>
                  <div className="detail-item">
                    <span className="label">Months Covered</span>
                    <span className="value">{emergencyFund.monthsCovered} months</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="planning-section">
            <h2>Financial Trajectory</h2>
            {trajectory.length > 0 && (
              <div className="trajectory-table">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Age</th>
                      <th>Income</th>
                      <th>Savings</th>
                      <th>Net Worth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trajectory.map((t) => (
                      <tr key={t.year}>
                        <td>{t.year}</td>
                        <td>{t.age}</td>
                        <td>${t.income.toLocaleString()}</td>
                        <td>${t.savings.toLocaleString()}</td>
                        <td>${t.netWorth.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="planning-section">
            <h2>💡 Financial Recommendations</h2>
            <div className="recommendations-list">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="recommendation-item">
                  <p>{rec}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="planning-section tools">
        <h2>📊 Additional Tools</h2>
        <p className="note">Coming soon: Net worth calculator, income projection, and tax optimization for retirement</p>
      </div>
    </div>
  );
}

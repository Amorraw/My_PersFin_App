import React, { useState, useEffect } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import "./TaxPlanning.css";

const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

interface TaxAccount {
  _id: string;
  accountType: "rrsp" | "tfsa" | "non-registered";
  accountName: string;
  rrspLifetimeRoom?: number;
  rrspContributions?: number;
  tfsaLifetimeRoom?: number;
  tfsaContributions?: number;
  priorYearIncome?: number;
  maritalStatus?: string;
  currentValue?: number;
}

interface RRSPRoom {
  rrspLifetimeRoom: number;
  rrspContributions: number;
  remainingRoom: number;
  recommendation: string;
}

interface TFSARoom {
  tfsaLifetimeRoom: number;
  tfsaContributions: number;
  remainingRoom: number;
  recommendation: string;
}

export function TaxPlanning() {
  const [taxAccounts, setTaxAccounts] = useState<TaxAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<TaxAccount | null>(null);
  const [rrspRoom, setRRSPRoom] = useState<RRSPRoom | null>(null);
  const [tfsaRoom, setTFSARoom] = useState<TFSARoom | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    accountType: "rrsp" as "rrsp" | "tfsa" | "non-registered",
    accountName: "",
    priorYearIncome: 0,
    maritalStatus: "single",
  });

  useEffect(() => {
    fetchTaxAccounts();
  }, []);

  const fetchTaxAccounts = async () => {
    try {
      setLoading(true);
      const data = await api("/tax-accounts");
      setTaxAccounts(data.taxAccounts || []);
    } catch (err) {
      console.error("Failed to fetch tax accounts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/tax-accounts", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      setFormData({
        accountType: "rrsp",
        accountName: "",
        priorYearIncome: 0,
        maritalStatus: "single",
      });
      await fetchTaxAccounts();
    } catch (err) {
      console.error("Failed to create tax account:", err);
      alert("Failed to create tax account");
    }
  };

  const handleSelectAccount = async (account: TaxAccount) => {
    setSelectedAccount(account);

    // Fetch room info based on account type
    if (account.accountType === "rrsp" && account._id) {
      try {
        const data = await api(`/tax-accounts/${account._id}/rrsp-room`);
        setRRSPRoom(data);
      } catch (err) {
        console.error("Failed to fetch RRSP room:", err);
      }
    } else if (account.accountType === "tfsa" && account._id) {
      try {
        const data = await api(`/tax-accounts/${account._id}/tfsa-room`);
        setTFSARoom(data);
      } catch (err) {
        console.error("Failed to fetch TFSA room:", err);
      }
    }
  };

  return (
    <div className="tax-planning">
      <h1>📊 Tax Planning & Optimization</h1>

      <div className="tax-container">
        {/* Create New Tax Account */}
        <section className="tax-section card">
          <h2>Create Tax Account</h2>
          <form onSubmit={handleCreateAccount}>
            <div className="form-group">
              <label>Account Type</label>
              <select
                value={formData.accountType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    accountType: e.target.value as "rrsp" | "tfsa" | "non-registered",
                  })
                }
              >
                <option value="rrsp">RRSP (Registered Retirement Savings Plan)</option>
                <option value="tfsa">TFSA (Tax-Free Savings Account)</option>
                <option value="non-registered">Non-Registered Account</option>
              </select>
            </div>

            <div className="form-group">
              <label>Account Name</label>
              <input
                type="text"
                placeholder="e.g., My RRSP"
                value={formData.accountName}
                onChange={(e) =>
                  setFormData({ ...formData, accountName: e.target.value })
                }
                required
              />
            </div>

            {formData.accountType === "rrsp" && (
              <div className="form-group">
                <label>Prior Year Income (for RRSP calculation)</label>
                <input
                  type="number"
                  placeholder="$0"
                  value={formData.priorYearIncome}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priorYearIncome: Number(e.target.value),
                    })
                  }
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary">
              Create Account
            </button>
          </form>
        </section>

        {/* Tax Accounts List */}
        <section className="tax-section card">
          <h2>Your Tax Accounts</h2>
          {loading ? (
            <p>Loading...</p>
          ) : taxAccounts.length === 0 ? (
            <p>No tax accounts yet. Create one above!</p>
          ) : (
            <div className="accounts-grid">
              {taxAccounts.map((account) => (
                <div
                  key={account._id}
                  className={`account-card ${
                    selectedAccount?._id === account._id ? "selected" : ""
                  }`}
                  onClick={() => handleSelectAccount(account)}
                >
                  <div className="account-icon">
                    {account.accountType === "rrsp" && "💰"}
                    {account.accountType === "tfsa" && "🎁"}
                    {account.accountType === "non-registered" && "📈"}
                  </div>
                  <h3>{account.accountName}</h3>
                  <p className="account-type">
                    {account.accountType.toUpperCase()}
                  </p>
                  {account.currentValue && (
                    <p className="account-balance">
                      ${account.currentValue.toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Selected Account Details */}
      {selectedAccount && (
        <section className="tax-section card account-details">
          <h2>
            {selectedAccount.accountName} ({selectedAccount.accountType.toUpperCase()})
          </h2>

          {selectedAccount.accountType === "rrsp" && rrspRoom && (
            <div className="contribution-room">
              <h3>RRSP Contribution Room</h3>
              <div className="room-info">
                <div className="room-stat">
                  <label>Lifetime Room</label>
                  <p className="amount">${rrspRoom.rrspLifetimeRoom.toLocaleString()}</p>
                </div>
                <div className="room-stat">
                  <label>Contributed This Year</label>
                  <p className="amount">${rrspRoom.rrspContributions.toLocaleString()}</p>
                </div>
                <div className="room-stat highlight">
                  <label>Remaining Room</label>
                  <p className="amount">${rrspRoom.remainingRoom.toLocaleString()}</p>
                </div>
              </div>
              <div className="recommendation">
                <p>💡 {rrspRoom.recommendation}</p>
              </div>
            </div>
          )}

          {selectedAccount.accountType === "tfsa" && tfsaRoom && (
            <div className="contribution-room">
              <h3>TFSA Contribution Room</h3>
              <div className="room-info">
                <div className="room-stat">
                  <label>Lifetime Room</label>
                  <p className="amount">${tfsaRoom.tfsaLifetimeRoom.toLocaleString()}</p>
                </div>
                <div className="room-stat">
                  <label>Contributed This Year</label>
                  <p className="amount">${tfsaRoom.tfsaContributions.toLocaleString()}</p>
                </div>
                <div className="room-stat highlight">
                  <label>Remaining Room</label>
                  <p className="amount">${tfsaRoom.remainingRoom.toLocaleString()}</p>
                </div>
              </div>
              <div className="recommendation">
                <p>💡 {tfsaRoom.recommendation}</p>
              </div>
            </div>
          )}

          {selectedAccount.accountType === "non-registered" && (
            <div className="optimization-tips">
              <h3>Non-Registered Account Tips</h3>
              <div className="tips-list">
                <div className="tip">
                  <span>📍</span>
                  <p>
                    <strong>Hold dividend stocks here</strong> for dividend tax credit benefits
                  </p>
                </div>
                <div className="tip">
                  <span>📍</span>
                  <p>
                    <strong>Tax-loss harvest</strong> unrealized losses to offset gains
                  </p>
                </div>
                <div className="tip">
                  <span>📍</span>
                  <p>
                    <strong>Track ACB</strong> (Adjusted Cost Base) for accurate capital gains
                  </p>
                </div>
              </div>
            </div>
          )}

          <TaxOptimizationTools accountId={selectedAccount._id} />
        </section>
      )}
    </div>
  );
}

interface TaxOptimizationToolsProps {
  accountId: string;
}

function TaxOptimizationTools({ accountId }: TaxOptimizationToolsProps) {
  const [showTools, setShowTools] = useState(false);

  return (
    <>
      <button
        className="btn btn-secondary"
        onClick={() => setShowTools(!showTools)}
      >
        {showTools ? "Hide" : "Show"} Optimization Tools
      </button>

      {showTools && (
        <div className="optimization-tools">
          <h3>🔧 Tax Optimization Tools</h3>

          <div className="tool-section">
            <h4>Calculate RRSP Tax Savings</h4>
            <RRSPTaxSavingsCalculator accountId={accountId} />
          </div>

          <div className="tool-section">
            <h4>Capital Gains Tax Calculator</h4>
            <CapitalGainsTaxCalculator accountId={accountId} />
          </div>

          <div className="tool-section">
            <h4>Dividend Account Optimization</h4>
            <DividendOptimizationTool accountId={accountId} />
          </div>

          <div className="tool-section">
            <h4>Marginal Tax Rate Finder</h4>
            <MarginalTaxRateCalculator />
          </div>
        </div>
      )}
    </>
  );
}

function RRSPTaxSavingsCalculator({ accountId }: { accountId: string }) {
  const [contribution, setContribution] = useState(5000);
  const [taxRate, setTaxRate] = useState(30);
  const [result, setResult] = useState<any>(null);

  const calculate = async () => {
    try {
      const data = await api(`/tax-accounts/${accountId}/rrsp-tax-savings`, {
        method: "POST",
        body: JSON.stringify({
          contributionAmount: contribution,
          marginalTaxRate: taxRate,
        }),
      });
      setResult(data);
    } catch (err) {
      console.error("Failed to calculate:", err);
    }
  };

  return (
    <div className="calculator">
      <div className="input-group">
        <label>Contribution Amount: ${contribution.toLocaleString()}</label>
        <input
          type="range"
          min="0"
          max="50000"
          step="500"
          value={contribution}
          onChange={(e) => setContribution(Number(e.target.value))}
        />
      </div>

      <div className="input-group">
        <label>Your Marginal Tax Rate: {taxRate}%</label>
        <select value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
          <option value={20}>20% (Low income)</option>
          <option value={30}>30% (Mid income)</option>
          <option value={40}>40% (High income)</option>
          <option value={50}>50%+ (Very high income)</option>
        </select>
      </div>

      <button onClick={calculate} className="btn btn-primary">
        Calculate Tax Savings
      </button>

      {result && (
        <div className="calculation-result">
          <p>
            <strong>Tax Savings:</strong> ${result.taxSavings.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
          <p>
            <strong>Your Net Cost:</strong> ${result.netContribution.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
          <p>
            <em>Note: ${ result.futureWithdrawalTax.toLocaleString("en-US", { maximumFractionDigits: 2 })} may be owed when withdrawn</em>
          </p>
        </div>
      )}
    </div>
  );
}

function CapitalGainsTaxCalculator({ accountId }: { accountId: string }) {
  const [gain, setGain] = useState(10000);
  const [taxRate, setTaxRate] = useState(30);
  const [priorGains, setPriorGains] = useState(0);
  const [result, setResult] = useState<any>(null);

  const calculate = async () => {
    try {
      const data = await api(`/tax-accounts/${accountId}/capital-gains-tax`, {
        method: "POST",
        body: JSON.stringify({
          unrealizedGain: gain,
          marginalTaxRate: taxRate,
          priorGainsThisYear: priorGains,
        }),
      });
      setResult(data);
    } catch (err) {
      console.error("Failed to calculate:", err);
    }
  };

  return (
    <div className="calculator">
      <div className="input-group">
        <label>Capital Gain to Realize: ${gain.toLocaleString()}</label>
        <input
          type="range"
          min="0"
          max="500000"
          step="5000"
          value={gain}
          onChange={(e) => setGain(Number(e.target.value))}
        />
      </div>

      <div className="input-group">
        <label>Capital Gains Already Realized This Year: ${priorGains.toLocaleString()}</label>
        <input
          type="range"
          min="0"
          max="500000"
          step="5000"
          value={priorGains}
          onChange={(e) => setPriorGains(Number(e.target.value))}
        />
        <small style={{ color: "var(--text-secondary)" }}>
          Gains below $250K/year use 50% inclusion; gains above use 66.7% (June 2024 budget)
        </small>
      </div>

      <div className="input-group">
        <label>Marginal Tax Rate: {taxRate}%</label>
        <select value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
          <option value={20}>20%</option>
          <option value={30}>30%</option>
          <option value={40}>40%</option>
          <option value={50}>50%+</option>
        </select>
      </div>

      <button onClick={calculate} className="btn btn-primary">
        Calculate Tax
      </button>

      {result && result.message ? (
        <div className="calculation-result">
          <p>{result.message}</p>
        </div>
      ) : result ? (
        <div className="calculation-result">
          {result.highRatePortion > 0 && (
            <p style={{ color: "var(--warning)" }}>
              ⚠️ Gain crosses $250K annual threshold — two inclusion rates apply
            </p>
          )}
          <p>
            <strong>Portion at 50% inclusion:</strong>{" "}
            ${result.lowRatePortion?.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          {result.highRatePortion > 0 && (
            <p>
              <strong>Portion at 66.7% inclusion (above $250K):</strong>{" "}
              ${result.highRatePortion?.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
          )}
          <p>
            <strong>Total Taxable Gain:</strong>{" "}
            ${result.taxableGain?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            {" "}
            <em>
              (effective inclusion: {((result.effectiveInclusionRate ?? 0.5) * 100).toFixed(1)}%)
            </em>
          </p>
          <p>
            <strong>Estimated Tax Owed:</strong>{" "}
            ${result.taxOwed?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
          <p style={{ fontSize: "0.85em", color: "var(--text-secondary)" }}>
            {result.breakdown}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DividendOptimizationTool({ accountId }: { accountId: string }) {
  const [result, setResult] = useState<any>(null);

  const getOptimization = async () => {
    try {
      const data = await api(`/tax-accounts/${accountId}/dividend-optimization`);
      setResult(data);
    } catch (err) {
      console.error("Failed to fetch:", err);
    }
  };

  return (
    <div className="calculator">
      <button onClick={getOptimization} className="btn btn-primary">
        Get Dividend Optimization Tips
      </button>

      {result && (
        <div className="calculation-result">
          <p>
            <strong>{result.accountType} Suitability:</strong> {result.suitability}
          </p>
          <p>
            <strong>Tax Efficiency:</strong> {result.taxEfficiency}%
          </p>
          <p>{result.recommendation}</p>
        </div>
      )}
    </div>
  );
}

function MarginalTaxRateCalculator() {
  const { user } = useAuth();
  const [income, setIncome] = useState(50000);
  const [province, setProvince] = useState(user?.province ?? "ON");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (user?.province) setProvince(user.province);
  }, [user?.province]);

  const calculate = async () => {
    try {
      const data = await api(`/tax-accounts/marginal-rate/calculator?income=${income}&province=${province}`);
      setResult(data);
    } catch (err) {
      console.error("Failed to calculate:", err);
    }
  };

  return (
    <div className="calculator">
      <div className="input-group">
        <label>Annual Income: ${income.toLocaleString()}</label>
        <input
          type="range"
          min="0"
          max="300000"
          step="5000"
          value={income}
          onChange={(e) => setIncome(Number(e.target.value))}
        />
      </div>

      <div className="input-group">
        <label>Province / Territory</label>
        <select value={province} onChange={(e) => setProvince(e.target.value)}>
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        {user?.province && province !== user.province && (
          <small style={{ color: "var(--warning)" }}>
            Differs from your saved province ({user.province}). Update in{" "}
            <a href="/settings">Settings</a>.
          </small>
        )}
      </div>

      <button onClick={calculate} className="btn btn-primary">
        Calculate Rate
      </button>

      {result && (
        <div className="calculation-result">
          <p>
            <strong>Province:</strong> {result.provinceName} ({result.province})
          </p>
          <p>
            <strong>Federal Marginal Rate:</strong> {result.federalRate}%
            <span style={{ color: "var(--text-secondary)", fontSize: "0.85em" }}>
              {" "}({result.federalBracket})
            </span>
          </p>
          <p>
            <strong>Provincial Marginal Rate:</strong> {result.provincialRate}%
            <span style={{ color: "var(--text-secondary)", fontSize: "0.85em" }}>
              {" "}({result.provincialBracket})
            </span>
          </p>
          <p style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", marginTop: "0.5rem" }}>
            <strong>Combined Marginal Rate:</strong>{" "}
            <span style={{ fontSize: "1.2em", color: "var(--primary)" }}>
              {result.combinedRate.toFixed(2)}%
            </span>
          </p>
          <p>
            <em>
              An RRSP contribution saves you {result.combinedRate.toFixed(1)}% in taxes on every dollar contributed.
            </em>
          </p>
        </div>
      )}
    </div>
  );
}

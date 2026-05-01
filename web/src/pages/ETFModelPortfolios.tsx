import { useState } from "react";
import { api } from "../api";

interface AssetLocationRule {
  assetType: string;
  bestAccount: string;
  reason: string;
  priority: number;
  worstAccount: string;
}

const ALL_IN_ONE_ETFS = [
  {
    symbol: "XEQT",
    name: "iShares Core Equity ETF Portfolio",
    provider: "iShares (BlackRock)",
    equity: 100,
    bonds: 0,
    mer: 0.20,
    description: "100% global equity — maximum long-term growth, high short-term volatility. Best for investors with 20+ year horizons.",
    holdings: { canadianEquity: 25, usEquity: 45, intlEquity: 27, emerging: 3 },
    riskLevel: "Aggressive",
    riskColor: "#dc2626",
  },
  {
    symbol: "VEQT",
    name: "Vanguard All-Equity ETF Portfolio",
    provider: "Vanguard Canada",
    equity: 100,
    bonds: 0,
    mer: 0.24,
    description: "100% global equity. Slightly higher Canadian home bias than XEQT. Ideal for long-term investors comfortable with full equity volatility.",
    holdings: { canadianEquity: 30, usEquity: 43, intlEquity: 21, emerging: 6 },
    riskLevel: "Aggressive",
    riskColor: "#dc2626",
  },
  {
    symbol: "XGRO",
    name: "iShares Core Growth ETF Portfolio",
    provider: "iShares (BlackRock)",
    equity: 80,
    bonds: 20,
    mer: 0.20,
    description: "80% equity / 20% bonds. A popular balanced-growth option for investors with a 10–20 year horizon who want some downside cushion.",
    holdings: { canadianEquity: 20, usEquity: 36, intlEquity: 22, bonds: 20, emerging: 2 },
    riskLevel: "Growth",
    riskColor: "#d97706",
  },
  {
    symbol: "VGRO",
    name: "Vanguard Growth ETF Portfolio",
    provider: "Vanguard Canada",
    equity: 80,
    bonds: 20,
    mer: 0.24,
    description: "80% equity / 20% bonds. Near-identical to XGRO with slightly higher Canadian equity tilt. Great for 10–20 year investors.",
    holdings: { canadianEquity: 24, usEquity: 35, intlEquity: 17, bonds: 20, emerging: 4 },
    riskLevel: "Growth",
    riskColor: "#d97706",
  },
  {
    symbol: "XBAL",
    name: "iShares Core Balanced ETF Portfolio",
    provider: "iShares (BlackRock)",
    equity: 60,
    bonds: 40,
    mer: 0.20,
    description: "60% equity / 40% bonds. The classic balanced portfolio — lower volatility, suitable for 5–10 year horizons or near-retirees.",
    holdings: { canadianEquity: 15, usEquity: 27, intlEquity: 17, bonds: 40, emerging: 1 },
    riskLevel: "Balanced",
    riskColor: "#2563eb",
  },
  {
    symbol: "VBAL",
    name: "Vanguard Balanced ETF Portfolio",
    provider: "Vanguard Canada",
    equity: 60,
    bonds: 40,
    mer: 0.24,
    description: "60% equity / 40% bonds. Same balanced approach as XBAL with Vanguard's fund lineup underneath.",
    holdings: { canadianEquity: 18, usEquity: 26, intlEquity: 13, bonds: 40, emerging: 3 },
    riskLevel: "Balanced",
    riskColor: "#2563eb",
  },
  {
    symbol: "XCNS",
    name: "iShares Core Conservative Balanced ETF Portfolio",
    provider: "iShares (BlackRock)",
    equity: 40,
    bonds: 60,
    mer: 0.20,
    description: "40% equity / 60% bonds. Conservative — suitable for retirees or investors with a 3–5 year horizon who prioritize capital preservation.",
    holdings: { canadianEquity: 10, usEquity: 18, intlEquity: 12, bonds: 60 },
    riskLevel: "Conservative",
    riskColor: "#16a34a",
  },
];

const COUCH_POTATO_PORTFOLIOS = [
  {
    name: "One-Fund Solution",
    complexity: "Beginner",
    funds: [
      { symbol: "XEQT or VEQT", pct: 100, type: "All-in-One Equity" },
    ],
    description: "Buy one ETF, set automatic contributions, rebalance never. Perfect for set-and-forget investors.",
    pros: ["Zero rebalancing needed", "Ultra-simple", "Globally diversified"],
    cons: ["Slightly higher MER than DIY", "Less control over asset location"],
  },
  {
    name: "Classic 3-Fund Portfolio",
    complexity: "Intermediate",
    funds: [
      { symbol: "VCN / ZCN", pct: 25, type: "Canadian Equity" },
      { symbol: "XAW / VXC", pct: 55, type: "Global ex-Canada Equity" },
      { symbol: "ZAG / VAB", pct: 20, type: "Canadian Bonds" },
    ],
    description: "Three ETFs covering the entire global market. Slightly lower cost, enables tax-efficient asset location across accounts.",
    pros: ["Full control over asset location", "Lower blended MER", "Clear separation of asset classes"],
    cons: ["Requires manual rebalancing annually", "More decisions"],
  },
  {
    name: "Canadian Dividend Focus",
    complexity: "Intermediate",
    funds: [
      { symbol: "CDZ / VDY", pct: 20, type: "Canadian Dividend Equity" },
      { symbol: "VFV / XSP", pct: 40, type: "US Equity" },
      { symbol: "XEF / VIU", pct: 20, type: "International Equity" },
      { symbol: "ZAG / VAB", pct: 20, type: "Canadian Bonds" },
    ],
    description: "Emphasizes Canadian dividend-paying stocks (eligible for the dividend tax credit) alongside global exposure.",
    pros: ["Tax-efficient Canadian dividend income", "Income stream for non-registered accounts", "Strong Canadian sector exposure"],
    cons: ["More concentrated in Canada", "Dividend-focused = sector concentration (banks/energy/utilities)"],
  },
];

export default function ETFModelPortfolios() {
  const [tab, setTab] = useState<"all-in-one" | "couch-potato" | "asset-location">("all-in-one");
  const [accountValues, setAccountValues] = useState({ tfsaValue: "", rrspValue: "", fhsaValue: "", nonRegValue: "" });
  const [locationResult, setLocationResult] = useState<{ rules: AssetLocationRule[]; accounts: any[]; total: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const runAssetLocation = async () => {
    setLoadingLocation(true);
    try {
      const data = await api("/portfolio/asset-location", {
        method: "POST",
        body: JSON.stringify({
          tfsaValue: Number(accountValues.tfsaValue) || 0,
          rrspValue: Number(accountValues.rrspValue) || 0,
          fhsaValue: Number(accountValues.fhsaValue) || 0,
          nonRegValue: Number(accountValues.nonRegValue) || 0,
        }),
      });
      setLocationResult(data);
    } catch { /* ignore */ }
    finally { setLoadingLocation(false); }
  };

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: "0.5rem 1.25rem",
    border: "none",
    borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
    background: "none",
    cursor: "pointer",
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? "var(--primary)" : "var(--text-secondary)",
    fontSize: "0.95rem",
  });

  return (
    <div style={{ padding: "2rem", maxWidth: 1000 }}>
      <h1>Canadian ETF Model Portfolios</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: 680 }}>
        Compare all-in-one ETFs, explore Couch Potato strategies, and optimize which assets
        belong in which registered account to maximize tax efficiency.
      </p>

      <div style={{ borderBottom: "1px solid var(--border)", marginBottom: "1.5rem", display: "flex" }}>
        <button style={tabStyle("all-in-one")} onClick={() => setTab("all-in-one")}>All-in-One ETFs</button>
        <button style={tabStyle("couch-potato")} onClick={() => setTab("couch-potato")}>Couch Potato Portfolios</button>
        <button style={tabStyle("asset-location")} onClick={() => setTab("asset-location")}>Asset Location Guide</button>
      </div>

      {/* ── All-in-One ETFs ── */}
      {tab === "all-in-one" && (
        <div>
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "0.9rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.88rem" }}>
            All-in-one ETFs hold hundreds of underlying funds and automatically rebalance internally.
            MERs shown are approximate 2024 values. Data is for educational purposes — always verify with the fund provider.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {ALL_IN_ONE_ETFS.map((etf) => (
              <div key={etf.symbol} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <div>
                    <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--primary)" }}>{etf.symbol}</span>
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.72rem", background: etf.riskColor, color: "white", padding: "2px 8px", borderRadius: 8 }}>
                      {etf.riskLevel}
                    </span>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    MER {etf.mer}%
                  </div>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>{etf.provider}</div>
                <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 0.75rem" }}>{etf.description}</p>

                {/* Allocation bar */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: "0.35rem" }}>
                    <div style={{ width: `${etf.equity}%`, background: "var(--primary)" }} title="Equity" />
                    <div style={{ width: `${etf.bonds}%`, background: "#94a3b8" }} title="Bonds" />
                  </div>
                  <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--primary)" }}>■ {etf.equity}% Equity</span>
                    {etf.bonds > 0 && <span style={{ color: "#94a3b8" }}>■ {etf.bonds}% Bonds</span>}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem", fontSize: "0.75rem" }}>
                  {Object.entries(etf.holdings).map(([k, v]) => (
                    <div key={k} style={{ color: "var(--text-secondary)" }}>
                      <span style={{ textTransform: "capitalize" }}>{k.replace(/([A-Z])/g, " $1")}: </span>
                      <strong>{v}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0 }}>Quick Comparison</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ background: "var(--background)" }}>
                  {["Symbol", "Equity %", "Bonds %", "MER", "Best For"].map((h) => (
                    <th key={h} style={{ padding: "0.6rem 0.9rem", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_IN_ONE_ETFS.map((e, i) => (
                  <tr key={e.symbol} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                    <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--primary)" }}>{e.symbol}</td>
                    <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)" }}>{e.equity}%</td>
                    <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)" }}>{e.bonds}%</td>
                    <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)" }}>{e.mer}%</td>
                    <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "0.82rem" }}>{e.riskLevel} investors</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Couch Potato ── */}
      {tab === "couch-potato" && (
        <div>
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "0.9rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.88rem" }}>
            The <strong>Canadian Couch Potato</strong> strategy, popularized by Dan Bortolotti, uses simple low-cost index ETFs
            to match the market rather than beat it — beating most actively managed funds over the long run.
          </div>

          {COUCH_POTATO_PORTFOLIOS.map((p) => (
            <div key={p.name} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <span style={{ fontSize: "0.75rem", background: "var(--background)", border: "1px solid var(--border)", padding: "2px 10px", borderRadius: 8 }}>
                  {p.complexity}
                </span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>{p.description}</p>

              {/* Fund allocation bars */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: "0.4rem" }}>
                  {p.funds.map((f, i) => {
                    const colors = ["var(--primary)", "#16a34a", "#94a3b8", "#d97706"];
                    return <div key={f.symbol} style={{ width: `${f.pct}%`, background: colors[i % colors.length] }} title={`${f.symbol}: ${f.pct}%`} />;
                  })}
                </div>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  {p.funds.map((f, i) => {
                    const colors = ["var(--primary)", "#16a34a", "#94a3b8", "#d97706"];
                    return (
                      <div key={f.symbol} style={{ fontSize: "0.78rem", color: colors[i % colors.length] }}>
                        ■ <strong>{f.symbol}</strong> — {f.type} ({f.pct}%)
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--success)" }}>Pros</div>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {p.pros.map((pr) => <li key={pr} style={{ fontSize: "0.84rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>{pr}</li>)}
                  </ul>
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.4rem", color: "#d97706" }}>Cons</div>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {p.cons.map((c) => <li key={c} style={{ fontSize: "0.84rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>{c}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Asset Location ── */}
      {tab === "asset-location" && (
        <div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h3 style={{ marginTop: 0 }}>Your Account Values (optional)</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>
              Enter your account balances for a personalized asset location summary.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
              {[
                { key: "tfsaValue", label: "TFSA Total ($)" },
                { key: "rrspValue", label: "RRSP Total ($)" },
                { key: "fhsaValue", label: "FHSA Total ($)" },
                { key: "nonRegValue", label: "Non-Registered ($)" },
              ].map(({ key, label }) => (
                <div key={key} className="form-group">
                  <label>{label}</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={(accountValues as any)[key]}
                    onChange={(e) => setAccountValues((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={runAssetLocation} disabled={loadingLocation}>
              {loadingLocation ? "Loading…" : "Get Personalized Guide"}
            </button>
          </div>

          {locationResult && locationResult.accounts.length > 0 && (
            <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "0.9rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.88rem" }}>
              <strong>Your registered accounts:</strong>{" "}
              {locationResult.accounts.map((a: any) => `${a.type} ($${a.value.toLocaleString()})`).join(" · ")}
              {" — Total "}
              <strong>${locationResult.total.toLocaleString()}</strong>
            </div>
          )}

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0 }}>Canadian Tax-Law Asset Location Rules</h3>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                Priority 1 = strong preference; Priority 2 = moderate preference based on Canadian tax rules.
              </p>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ background: "var(--background)" }}>
                  {["Asset Type", "Best Account", "Avoid", "Reason"].map((h) => (
                    <th key={h} style={{ padding: "0.6rem 0.9rem", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(locationResult?.rules || [
                  { assetType: "High-growth equity ETFs (XEQT, VEQT)", bestAccount: "TFSA", worstAccount: "Non-Registered", reason: "Tax-free growth most valuable for highest-returning assets", priority: 1 },
                  { assetType: "US equity ETFs (VFV, XSP)", bestAccount: "RRSP", worstAccount: "TFSA", reason: "Canada–US treaty eliminates 15% withholding tax inside RRSP only", priority: 1 },
                  { assetType: "Canadian bond ETFs (ZAG, VAB)", bestAccount: "RRSP", worstAccount: "Non-Registered", reason: "Interest income is 100% taxable — defer in RRSP", priority: 1 },
                  { assetType: "Canadian equity ETFs (VCN, ZCN)", bestAccount: "Non-Reg or TFSA", worstAccount: "RRSP", reason: "Eligible for dividend tax credit in non-registered accounts", priority: 2 },
                  { assetType: "Canadian REITs (ZRE, XRE)", bestAccount: "RRSP or TFSA", worstAccount: "Non-Registered", reason: "Distributions are fully taxable — shelter in registered accounts", priority: 1 },
                  { assetType: "International equity ETFs (XEF, VIU)", bestAccount: "TFSA or Non-Reg", worstAccount: "RRSP", reason: "Foreign withholding applies in RRSP for non-US countries", priority: 2 },
                  { assetType: "GICs / HISA", bestAccount: "TFSA", worstAccount: "Non-Registered", reason: "Interest is 100% taxable — TFSA converts it to tax-free income", priority: 1 },
                ]).map((r: AssetLocationRule, i: number) => (
                  <tr key={r.assetType} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                    <td style={{ padding: "0.6rem 0.9rem", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{r.assetType}</td>
                    <td style={{ padding: "0.6rem 0.9rem", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: 6, fontSize: "0.78rem", fontWeight: 600 }}>{r.bestAccount}</span>
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: 6, fontSize: "0.78rem" }}>{r.worstAccount}</span>
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "0.82rem" }}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

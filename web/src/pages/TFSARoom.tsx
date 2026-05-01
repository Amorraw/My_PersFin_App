import { useState } from "react";
import { api } from "../api";

interface ScheduleRow {
  year: number;
  annualLimit: number;
  cumulativeRoom: number;
  eligible: boolean;
}

interface Result {
  birthYear: number;
  firstEligibleYear: number;
  currentYear: number;
  lifetimeRoom: number;
  totalContributions: number;
  totalWithdrawalsPriorYears: number;
  remainingRoom: number;
  overContribution: number;
  monthlyPenalty: number;
  isOverContributed: boolean;
  nextYearTotalRoom: number;
  nextYearNewLimit: number;
  schedule: ScheduleRow[];
  notes: string[];
}

const fmt = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const currentYear = new Date().getFullYear();

export default function TFSARoom() {
  const [birthYear, setBirthYear]       = useState(1990);
  const [contributions, setContributions] = useState(0);
  const [withdrawals, setWithdrawals]   = useState(0);
  const [result, setResult]             = useState<Result | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");

  const calculate = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api(
        `/tax-accounts/tfsa-room/calculator?birthYear=${birthYear}` +
        `&totalContributions=${contributions}` +
        `&totalWithdrawalsPriorYears=${withdrawals}`
      );
      setResult(data);
    } catch (err: any) {
      setError(err?.message ?? "Calculation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 900 }}>
      <h1>TFSA Lifetime Room Calculator</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: 680 }}>
        Your TFSA contribution room is based on your year of birth and every calendar year
        you were 18+ and a Canadian resident since 2009. Enter your details to see your exact
        remaining room, year by year.
      </p>

      {/* ── Inputs ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Your Details</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem", marginBottom: "1.25rem" }}>

          <div className="form-group">
            <label>Year of Birth</label>
            <input
              type="number"
              min={1900}
              max={currentYear - 17}
              value={birthYear}
              onChange={(e) => setBirthYear(Number(e.target.value))}
            />
            <small style={{ color: "var(--text-secondary)" }}>
              You became eligible starting {Math.max(2009, birthYear + 18)}.
            </small>
          </div>

          <div className="form-group">
            <label>Total TFSA Contributions Ever ($)</label>
            <input
              type="number"
              min={0}
              value={contributions}
              onChange={(e) => setContributions(Number(e.target.value))}
              placeholder="0"
            />
            <small style={{ color: "var(--text-secondary)" }}>
              Sum of all deposits ever made across all your TFSAs.
            </small>
          </div>

          <div className="form-group">
            <label>Total Withdrawals Made in Prior Years ($)</label>
            <input
              type="number"
              min={0}
              value={withdrawals}
              onChange={(e) => setWithdrawals(Number(e.target.value))}
              placeholder="0"
            />
            <small style={{ color: "var(--text-secondary)" }}>
              Withdrawals before Jan 1 this year — these add back to your room now.
              Do <em>not</em> include withdrawals made this calendar year.
            </small>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ minWidth: 160 }}
          onClick={calculate}
          disabled={loading}
        >
          {loading ? "Calculating…" : "Calculate My Room"}
        </button>
        {error && <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Over-contribution alert */}
          {result.isOverContributed && (
            <div style={{ background: "#fef2f2", border: "2px solid var(--danger)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
              <strong style={{ color: "var(--danger)", fontSize: "1rem" }}>
                ⚠️ Over-Contribution Detected
              </strong>
              <p style={{ margin: "0.5rem 0 0", color: "var(--danger)" }}>
                You have over-contributed by <strong>{fmt(result.overContribution)}</strong>.
                The CRA penalty is <strong>1% per month</strong> on the excess —
                currently <strong>{fmt(result.monthlyPenalty)}/month</strong>.
                Withdraw the excess immediately to stop the penalty from accumulating.
              </p>
            </div>
          )}

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {[
              {
                label: "Lifetime Room Accumulated",
                value: fmt(result.lifetimeRoom),
                sub: `Since ${result.firstEligibleYear}`,
                color: "var(--primary)",
              },
              {
                label: "Total Contributed",
                value: fmt(result.totalContributions),
                sub: "All TFSAs combined",
                color: "inherit",
              },
              {
                label: "Prior-Year Withdrawals",
                value: fmt(result.totalWithdrawalsPriorYears),
                sub: "Added back to room",
                color: "var(--success)",
              },
              {
                label: result.isOverContributed ? "Over-Contribution" : "Remaining Room",
                value: result.isOverContributed
                  ? fmt(result.overContribution)
                  : fmt(result.remainingRoom),
                sub: result.isOverContributed
                  ? `Penalty: ${fmt(result.monthlyPenalty)}/month`
                  : "Available to contribute now",
                color: result.isOverContributed ? "var(--danger)" : "var(--success)",
              },
            ].map((card) => (
              <div key={card.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>{card.label}</div>
                <div style={{ fontSize: "1.45rem", fontWeight: 700, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Next year info */}
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "0.9rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            <strong>Starting January 1, {result.currentYear + 1}:</strong> Your room increases
            by {fmt(result.nextYearNewLimit)} (the {result.currentYear + 1} annual limit),
            bringing your total lifetime room to {fmt(result.nextYearTotalRoom)}.
            Any withdrawals made this calendar year also re-add on that date.
          </div>

          {/* Year-by-year table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0 }}>Year-by-Year TFSA Room Schedule</h3>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Room highlighted in grey indicates years before you were eligible.
              </p>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ background: "var(--background)", textAlign: "left" }}>
                    {["Year", "Annual Limit", "Cumulative Room", "Your Status"].map((h) => (
                      <th key={h} style={{ padding: "0.6rem 1rem", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((row, i) => (
                    <tr
                      key={row.year}
                      style={{
                        background: !row.eligible
                          ? "var(--background)"
                          : row.year === result.currentYear
                            ? "#eff6ff"
                            : i % 2 === 0 ? "var(--surface)" : "var(--background)",
                        opacity: row.eligible ? 1 : 0.5,
                      }}
                    >
                      <td style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--border)", fontWeight: row.year === result.currentYear ? 700 : 400 }}>
                        {row.year}
                        {row.year === result.currentYear && (
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.72rem", background: "var(--primary)", color: "white", padding: "1px 6px", borderRadius: 8 }}>
                            Current
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--border)" }}>
                        {row.eligible ? fmt(row.annualLimit) : "—"}
                      </td>
                      <td style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>
                        {row.eligible ? fmt(row.cumulativeRoom) : "—"}
                      </td>
                      <td style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--border)", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        {!row.eligible
                          ? `Not yet eligible (turn 18 in ${result.birthYear + 18})`
                          : row.year < result.firstEligibleYear
                            ? "Not yet eligible"
                            : "Room accumulating"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Key rules */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
            <h3 style={{ marginTop: 0 }}>Key TFSA Rules</h3>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
              {result.notes.map((note, i) => (
                <li key={i} style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {note}
                </li>
              ))}
              <li style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                The CRA tracks your TFSA room using your SIN. You can verify your exact room
                through <strong>My CRA Account</strong> at canada.ca — always cross-check before
                making large contributions.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

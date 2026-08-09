// Standalone TFSA lifetime room calculator based on birth year and contribution history
import { useState } from "react";
import { api } from "../api";
import "./TFSARoom.css";
import { fmtCAD as fmt } from "../utils/formatters";

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

const currentYear = new Date().getFullYear();

// Renders input form and year-by-year TFSA room schedule with over-contribution alert
export default function TFSARoom() {
  const [birthYear, setBirthYear]         = useState(1990);
  const [contributions, setContributions] = useState(0);
  const [withdrawals, setWithdrawals]     = useState(0);
  const [result, setResult]               = useState<Result | null>(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");

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
    <div className="tfsa-container">
      <h1>TFSA Lifetime Room Calculator</h1>
      <p className="tfsa-intro">
        Your TFSA contribution room is based on your year of birth and every calendar year
        you were 18+ and a Canadian resident since 2009. Enter your details to see your exact
        remaining room, year by year.
      </p>

      {/* ── Inputs ── */}
      <div className="section-card">
        <h2>Your Details</h2>
        <div className="tfsa-input-grid">
          <div className="form-group">
            <label>Year of Birth</label>
            <input
              type="number"
              min={1900}
              max={currentYear - 17}
              value={birthYear}
              onChange={(e) => setBirthYear(Number(e.target.value))}
            />
            <small>You became eligible starting {Math.max(2009, birthYear + 18)}.</small>
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
            <small>Sum of all deposits ever made across all your TFSAs.</small>
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
            <small>
              Withdrawals before Jan 1 this year — these add back to your room now.
              Do <em>not</em> include withdrawals made this calendar year.
            </small>
          </div>
        </div>

        <button className="btn btn-primary" style={{ minWidth: 160 }} onClick={calculate} disabled={loading}>
          {loading ? "Calculating…" : "Calculate My Room"}
        </button>
        {error && <p className="error-msg">{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Over-contribution alert */}
          {result.isOverContributed && (
            <div className="over-contrib-alert">
              <strong>⚠️ Over-Contribution Detected</strong>
              <p>
                You have over-contributed by <strong>{fmt(result.overContribution)}</strong>.
                The CRA penalty is <strong>1% per month</strong> on the excess —
                currently <strong>{fmt(result.monthlyPenalty)}/month</strong>.
                Withdraw the excess immediately to stop the penalty from accumulating.
              </p>
            </div>
          )}

          {/* Summary cards */}
          <div className="tfsa-summary-grid">
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
              <div key={card.label} className="stat-card">
                <div className="stat-label">{card.label}</div>
                <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
                <div className="stat-sub">{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Next year info */}
          <div className="next-year-banner">
            <strong>Starting January 1, {result.currentYear + 1}:</strong> Your room increases
            by {fmt(result.nextYearNewLimit)} (the {result.currentYear + 1} annual limit),
            bringing your total lifetime room to {fmt(result.nextYearTotalRoom)}.
            Any withdrawals made this calendar year also re-add on that date.
          </div>

          {/* Year-by-year table */}
          <div className="schedule-table-card">
            <div className="table-card-header">
              <h3>Year-by-Year TFSA Room Schedule</h3>
              <p>Room highlighted in grey indicates years before you were eligible.</p>
            </div>
            <div className="table-scroll">
              <table className="schedule-table">
                <thead>
                  <tr>
                    {["Year", "Annual Limit", "Cumulative Room", "Your Status"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((row, i) => {
                    let rowClass = "row-ineligible";
                    if (row.eligible) {
                      if (row.year === result.currentYear) rowClass = "row-current";
                      else rowClass = i % 2 === 0 ? "row-even" : "row-odd";
                    }
                    return (
                      <tr key={row.year} className={rowClass}>
                        <td>
                          {row.year}
                          {row.year === result.currentYear && (
                            <span className="current-year-badge">Current</span>
                          )}
                        </td>
                        <td>{row.eligible ? fmt(row.annualLimit) : "—"}</td>
                        <td style={{ fontWeight: 600 }}>{row.eligible ? fmt(row.cumulativeRoom) : "—"}</td>
                        <td style={{ fontSize: "0.72rem", color: "var(--text-light)" }}>
                          {!row.eligible
                            ? `Not yet eligible (turn 18 in ${result.birthYear + 18})`
                            : row.year < result.firstEligibleYear
                              ? "Not yet eligible"
                              : "Room accumulating"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Key rules */}
          <div className="rules-card">
            <h3>Key TFSA Rules</h3>
            <ul className="rules-list">
              {result.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
              <li>
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

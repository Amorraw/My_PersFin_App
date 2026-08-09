// Calendar heatmap visualizing daily expense intensity across the year
import { useState, useEffect, useMemo } from "react";
import './SpendingHeatmap.css';
import { fmtMoney as CAD } from "../utils/formatters";

interface Transaction {
  _id: string;
  date: string;
  amount: number;
  category: string;
  description: string;
  type: "income" | "expense" | "transfer";
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function heatColor(pct: number, isDark: boolean): string {
  if (pct === 0) return isDark ? "#1f2937" : "#f3f4f6";
  if (pct < 0.25) return "#bfdbfe";
  if (pct < 0.5)  return "#60a5fa";
  if (pct < 0.75) return "#2563eb";
  return "#1d4ed8";
}

// Renders 12-month calendar grid with heat-colored daily spending cells
export default function SpendingHeatmap() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filterCategory, setFilterCategory] = useState("all");
  const [hoveredDay, setHoveredDay] = useState<{ date: string; amount: number; txns: Transaction[] } | null>(null);
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/transactions?limit=2000`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setTransactions(d.transactions ?? d ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(transactions.map((t) => t.category).filter(Boolean));
    return ["all", ...Array.from(cats).sort()];
  }, [transactions]);

  // Aggregates expense totals per calendar day for heatmap cell intensity
  const dailyMap = useMemo(() => {
    const map: Record<string, { amount: number; txns: Transaction[] }> = {};
    for (const t of transactions) {
      if (!t.date || t.type !== "expense") continue;
      const d = new Date(t.date);
      if (d.getFullYear() !== year) continue;
      if (filterCategory !== "all" && t.category !== filterCategory) continue;
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) map[key] = { amount: 0, txns: [] };
      map[key].amount += t.amount;
      map[key].txns.push(t);
    }
    return map;
  }, [transactions, year, filterCategory]);

  const maxDay = useMemo(() => Math.max(...Object.values(dailyMap).map((v) => v.amount), 1), [dailyMap]);
  const totalSpend = useMemo(() => Object.values(dailyMap).reduce((s, v) => s + v.amount, 0), [dailyMap]);
  const spendDays = Object.keys(dailyMap).length;
  const avgDay = spendDays > 0 ? totalSpend / spendDays : 0;

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, mo) => {
      const firstDay = new Date(year, mo, 1).getDay();
      const daysInMonth = new Date(year, mo + 1, 0).getDate();
      const weeks: (string | null)[][] = [];
      let week: (string | null)[] = Array(firstDay).fill(null);
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        week.push(dateStr);
        if (week.length === 7) { weeks.push(week); week = []; }
      }
      if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
      return { name: MONTHS[mo], weeks };
    });
  }, [year]);

  const currentYear = new Date().getFullYear();

  return (
    <div className="spending-heatmap-container">
      <div className="heatmap-page-header">
        <div>
          <h1>Spending Heatmap</h1>
          <p className="heatmap-subtitle">Daily expense intensity — darker = more spent</p>
        </div>
        <div className="heatmap-controls">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All Categories" : c}</option>)}
          </select>
        </div>
      </div>

      <div className="heatmap-stats-bar">
        {[
          { label: "Total Spent", value: CAD(totalSpend) },
          { label: "Days with Spending", value: spendDays },
          { label: "Avg per Spend Day", value: CAD(avgDay) },
          { label: "Peak Day", value: CAD(maxDay) },
        ].map((s) => (
          <div key={s.label} className="heatmap-stat-card">
            <div className="heatmap-stat-label">{s.label}</div>
            <div className="heatmap-stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="heatmap-loading">Loading transactions…</div>
      ) : (
        <>
          <div className="heatmap-calendar-grid">
            {months.map((month) => (
              <div key={month.name} className="heatmap-month-card">
                <div className="heatmap-month-name">{month.name}</div>
                <div className="heatmap-day-headers">
                  {DAYS.map((d) => (
                    <div key={d} className="heatmap-day-header">{d[0]}</div>
                  ))}
                </div>
                {month.weeks.map((week, wi) => (
                  <div key={wi} className="heatmap-week-row">
                    {week.map((date, di) => {
                      if (!date) return <div key={di} />;
                      const data = dailyMap[date];
                      const pct = data ? data.amount / maxDay : 0;
                      const day = new Date(date + "T00:00:00").getDate();
                      return (
                        <div
                          key={di}
                          className="heatmap-day-cell"
                          title={data ? `${date}: ${CAD(data.amount)} (${data.txns.length} txn)` : date}
                          onMouseEnter={() => data && setHoveredDay({ date, amount: data.amount, txns: data.txns })}
                          onMouseLeave={() => setHoveredDay(null)}
                          style={{
                            background: heatColor(pct, isDark),
                            cursor: data ? "pointer" : "default",
                            color: pct > 0.5 ? "white" : "var(--text-light)",
                          }}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {hoveredDay && (
            <div className="heatmap-tooltip">
              <div className="heatmap-tooltip-title">{hoveredDay.date} — {CAD(hoveredDay.amount)}</div>
              {hoveredDay.txns.slice(0, 5).map((t) => (
                <div key={t._id} className="heatmap-tooltip-row">
                  <span>{t.description || t.category || "–"}</span>
                  <span className="heatmap-tooltip-amount">{CAD(Math.abs(t.amount))}</span>
                </div>
              ))}
              {hoveredDay.txns.length > 5 && <div className="heatmap-tooltip-more">+{hoveredDay.txns.length - 5} more</div>}
            </div>
          )}

          <div className="heatmap-legend">
            <span>Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <div
                key={p}
                className="heatmap-legend-swatch"
                style={{ background: heatColor(p, isDark) }}
              />
            ))}
            <span>More</span>
          </div>
        </>
      )}
    </div>
  );
}

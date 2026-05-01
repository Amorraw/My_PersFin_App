import { useState, useEffect, useMemo } from "react";

interface Transaction {
  _id: string;
  date: string;
  amount: number;
  category: string;
  description: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const CAD = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });

function heatColor(pct: number, isDark: boolean): string {
  if (pct === 0) return isDark ? "#1f2937" : "#f3f4f6";
  if (pct < 0.25) return "#bfdbfe";
  if (pct < 0.5)  return "#60a5fa";
  if (pct < 0.75) return "#2563eb";
  return "#1d4ed8";
}

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

  // Build daily spend map for the selected year
  const dailyMap = useMemo(() => {
    const map: Record<string, { amount: number; txns: Transaction[] }> = {};
    for (const t of transactions) {
      if (!t.date || t.amount >= 0) continue;
      const d = new Date(t.date);
      if (d.getFullYear() !== year) continue;
      if (filterCategory !== "all" && t.category !== filterCategory) continue;
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) map[key] = { amount: 0, txns: [] };
      map[key].amount += Math.abs(t.amount);
      map[key].txns.push(t);
    }
    return map;
  }, [transactions, year, filterCategory]);

  const maxDay = useMemo(() => Math.max(...Object.values(dailyMap).map((v) => v.amount), 1), [dailyMap]);
  const totalSpend = useMemo(() => Object.values(dailyMap).reduce((s, v) => s + v.amount, 0), [dailyMap]);
  const spendDays = Object.keys(dailyMap).length;
  const avgDay = spendDays > 0 ? totalSpend / spendDays : 0;

  // Build calendar grid month by month
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, mo) => {
      const firstDay = new Date(year, mo, 1).getDay(); // 0=Sun
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
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Spending Heatmap</h1>
          <p style={{ color: "var(--text-light)", fontSize: 14, margin: "4px 0 0" }}>Daily expense intensity — darker = more spent</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text)", fontSize: 14 }}
          >
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text)", fontSize: 14 }}
          >
            {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All Categories" : c}</option>)}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Spent", value: CAD(totalSpend) },
          { label: "Days with Spending", value: spendDays },
          { label: "Avg per Spend Day", value: CAD(avgDay) },
          { label: "Peak Day", value: CAD(maxDay) },
        ].map((s) => (
          <div key={s.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", flex: "1 1 140px" }}>
            <div style={{ fontSize: 11, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-light)" }}>Loading transactions…</div>
      ) : (
        <>
          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
            {months.map((month) => (
              <div key={month.name} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>{month.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                  {DAYS.map((d) => (
                    <div key={d} style={{ fontSize: 8, textAlign: "center", color: "var(--text-light)", fontWeight: 600 }}>{d[0]}</div>
                  ))}
                </div>
                {month.weeks.map((week, wi) => (
                  <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
                    {week.map((date, di) => {
                      if (!date) return <div key={di} />;
                      const data = dailyMap[date];
                      const pct = data ? data.amount / maxDay : 0;
                      const day = new Date(date + "T00:00:00").getDate();
                      return (
                        <div
                          key={di}
                          title={data ? `${date}: ${CAD(data.amount)} (${data.txns.length} txn)` : date}
                          onMouseEnter={() => data && setHoveredDay({ date, amount: data.amount, txns: data.txns })}
                          onMouseLeave={() => setHoveredDay(null)}
                          style={{
                            width: "100%", aspectRatio: "1", borderRadius: 3,
                            background: heatColor(pct, isDark),
                            cursor: data ? "pointer" : "default",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 7, color: pct > 0.5 ? "white" : "var(--text-light)",
                            fontWeight: 500,
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

          {/* Hover detail */}
          {hoveredDay && (
            <div style={{ position: "fixed", bottom: 80, right: 24, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, minWidth: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 100 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>{hoveredDay.date} — {CAD(hoveredDay.amount)}</div>
              {hoveredDay.txns.slice(0, 5).map((t) => (
                <div key={t._id} style={{ fontSize: 12, color: "var(--text-light)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                  <span>{t.description || t.category || "–"}</span>
                  <span style={{ color: "#dc2626", fontWeight: 600 }}>{CAD(Math.abs(t.amount))}</span>
                </div>
              ))}
              {hoveredDay.txns.length > 5 && <div style={{ fontSize: 11, color: "var(--text-light)", marginTop: 4 }}>+{hoveredDay.txns.length - 5} more</div>}
            </div>
          )}

          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", fontSize: 12, color: "var(--text-light)" }}>
            <span>Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <div key={p} style={{ width: 16, height: 16, borderRadius: 3, background: heatColor(p, isDark), border: "1px solid var(--border)" }} />
            ))}
            <span>More</span>
          </div>
        </>
      )}
    </div>
  );
}

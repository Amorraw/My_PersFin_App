from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings("ignore")

app = FastAPI(title="PersFin ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ─────────────────────────────────────────────────────────────

class MonthlySpend(BaseModel):
    month: str      # "YYYY-MM"
    category: str
    amount: float

class Transaction(BaseModel):
    id: str
    amount: float
    category: str
    date: str       # "YYYY-MM-DD"
    description: str = ""

class ForecastReq(BaseModel):
    monthly_spending: List[MonthlySpend]
    forecast_months: int = 3

class AnomalyReq(BaseModel):
    transactions: List[Transaction]

class BudgetSuggestReq(BaseModel):
    monthly_spending: List[MonthlySpend]


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _ets_forecast(series: pd.Series, n: int) -> tuple:
    """Returns (median_series, p25_series, p75_series) for n forecast months.

    Central forecast uses _seasonal_hugging_forecast (recency-weighted same-month
    averages + trend) — this guarantees a wavy, season-following line.
    Prediction bands (P25/P75) come from the spread of actual historical values
    for each calendar month, so the band width reflects real historical variability:
    wide band = that month is unpredictable, narrow band = that month is consistent.

    Upgrade path: if Holt-Winters finds a strong seasonal component (≥ 8 % of mean)
    we use it for the median instead, keeping the data-driven bands.
    """
    last_date = pd.Timestamp(series.index[-1])
    future_idx = pd.date_range(last_date + pd.DateOffset(months=1), periods=n, freq="MS")

    # Always compute the hugging forecast — used for bands and as HW fallback
    mid_hug, low_hug, high_hug = _seasonal_hugging_forecast(series, future_idx)

    if len(series) >= 24:
        try:
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
            fit = ExponentialSmoothing(
                series, trend="add", damped_trend=True,
                seasonal="add", seasonal_periods=12,
            ).fit(optimized=True)
            hw_seasonal_range = (
                float(fit.season.max() - fit.season.min())
                if hasattr(fit, "season") else 0.0
            )
            series_mean = float(series.mean())
            if series_mean > 0 and hw_seasonal_range >= 0.08 * series_mean:
                hw_mid = pd.Series(fit.forecast(n).values, index=future_idx)
                return hw_mid, low_hug, high_hug
        except Exception:
            pass

    return mid_hug, low_hug, high_hug


def _seasonal_hugging_forecast(
    series: pd.Series, future_idx: pd.DatetimeIndex
) -> tuple:
    """Recency-weighted same-month averages + trend, with P25/P75 prediction bands.

    Returns (median_series, p25_series, p75_series).

    For each forecast month M:
      median[M]  = recency-weighted mean of every historical month with calendar
                   month == M  (recent years weighted more heavily)
      p25/p75[M] = 25th / 75th percentile of those same historical values

    The P25–P75 band directly answers:
      • Upper band high?  → cut opportunity, spend was historically elevated
      • Lower band low?   → savings opportunity, that month tends to be cheap
      • Wide band?        → unpredictable month, budget conservatively
      • Narrow band?      → highly consistent, easy to plan around

    A trend multiplier  (1 + annual_growth)^(months_ahead/12)  gently tilts all
    three curves up or down together so the band follows the recent trajectory.
    """
    # ── Per-calendar-month historical data ───────────────────────────────────────
    monthly_raw: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    for ts, val in series.items():
        monthly_raw[ts.month].append(float(val))

    # Recency-weighted mean per calendar month
    monthly_weighted_mid: dict[int, float] = {}
    for cal_month, raw_vals in monthly_raw.items():
        if not raw_vals:
            monthly_weighted_mid[cal_month] = float(series.mean())
            continue
        pts = [(ts.year, float(val))
               for ts, val in series.items() if ts.month == cal_month]
        years_sorted = sorted({y for y, _ in pts})
        year_rank = {yr: i + 1 for i, yr in enumerate(years_sorted)}
        total_w = sum(year_rank[y] for y, _ in pts)
        monthly_weighted_mid[cal_month] = sum(year_rank[y] * v for y, v in pts) / total_w

    # ── Annual trend from recent vs prior period ──────────────────────────────────
    if len(series) >= 24:
        recent_mean = float(series.iloc[-12:].mean())
        prior_mean  = float(series.iloc[-24:-12].mean())
    elif len(series) >= 6:
        mid = len(series) // 2
        recent_mean = float(series.iloc[mid:].mean())
        prior_mean  = float(series.iloc[:mid].mean())
    else:
        recent_mean = prior_mean = float(series.mean())

    annual_growth = max(-0.25, min(0.25, recent_mean / prior_mean - 1.0)) if prior_mean > 0 else 0.0

    # ── Build three curves ────────────────────────────────────────────────────────
    mid_vals, low_vals, high_vals = [], [], []
    for i, future_date in enumerate(future_idx):
        cal_month = future_date.month
        raw = monthly_raw[cal_month]
        trend_factor = (1.0 + annual_growth) ** ((i + 1) / 12.0)

        mid  = monthly_weighted_mid[cal_month] * trend_factor

        if len(raw) >= 2:
            low  = float(np.percentile(raw, 25)) * trend_factor
            high = float(np.percentile(raw, 75)) * trend_factor
        elif len(raw) == 1:
            low  = raw[0] * 0.80 * trend_factor
            high = raw[0] * 1.20 * trend_factor
        else:
            low  = mid * 0.85
            high = mid * 1.15

        mid_vals.append(mid)
        low_vals.append(low)
        high_vals.append(high)

    # ── Smooth bridge: anchor forecast start to last observed value ──────────────
    # Without this, a sharp gap appears at the historical→forecast boundary when
    # the last actual month differs from its seasonal average (e.g. a December spike
    # followed by a January seasonal dip).  We scale the first n_bridge forecast
    # points toward the last observed value, then linearly decay back to the pure
    # seasonal forecast so the transition looks natural.
    if mid_vals and mid_vals[0] > 0:
        last_obs = float(series.iloc[-1])
        scale0   = last_obs / mid_vals[0]
        scale0   = max(0.3, min(3.0, scale0))   # clamp extreme-outlier months
        n_bridge = min(len(mid_vals), 3)
        for i in range(len(mid_vals)):
            w = max(0.0, 1.0 - i / n_bridge)    # 1.0 at i=0, 0.0 at i=n_bridge
            s = 1.0 + (scale0 - 1.0) * w
            mid_vals[i]  *= s
            low_vals[i]  *= s
            high_vals[i] *= s

    return (
        pd.Series(mid_vals, index=future_idx),
        pd.Series(low_vals, index=future_idx),
        pd.Series(high_vals, index=future_idx),
    )


# ── Endpoints ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "PersFin ML"}


@app.post("/forecast")
def forecast_spending(req: ForecastReq):
    if not req.monthly_spending:
        raise HTTPException(400, "No spending data provided")

    df = pd.DataFrame([s.model_dump() for s in req.monthly_spending])
    df["month"] = pd.to_datetime(df["month"] + "-01")

    results = {}
    for cat, group in df.groupby("category"):
        g = group.sort_values("month").set_index("month")["amount"]
        if len(g) < 2:
            continue

        fc_mid, fc_low, fc_high = _ets_forecast(g, req.forecast_months)
        fc_mid  = fc_mid.clip(lower=0)
        fc_low  = fc_low.clip(lower=0)
        fc_high = fc_high.clip(lower=0)

        last_val = float(g.iloc[-1])
        fc_last  = float(fc_mid.iloc[-1])
        trend = "up" if fc_last > last_val * 1.03 else ("down" if fc_last < last_val * 0.97 else "stable")

        results[str(cat)] = {
            "historical": [
                {"month": m.strftime("%Y-%m"), "amount": round(float(a), 2)}
                for m, a in g.items()
            ],
            "forecast": [
                {
                    "month": m.strftime("%Y-%m"),
                    "amount": round(float(a), 2),
                    "low":    round(float(l), 2),
                    "high":   round(float(h), 2),
                }
                for (m, a), l, h in zip(fc_mid.items(), fc_low.values, fc_high.values)
            ],
            "trend": trend,
        }

    return {"forecasts": results, "months_forecast": req.forecast_months}


@app.post("/anomalies")
def detect_anomalies(req: AnomalyReq):
    if len(req.transactions) < 5:
        return {
            "anomalies": [],
            "totalScanned": len(req.transactions),
            "anomalyCount": 0,
            "message": f"Need at least 5 transactions (have {len(req.transactions)})",
        }

    df = pd.DataFrame([t.model_dump() for t in req.transactions])
    df["date"] = pd.to_datetime(df["date"])
    df["day_of_week"] = df["date"].dt.dayofweek
    df["day_of_month"] = df["date"].dt.day
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)

    # Per-category z-score
    cat_stats = df.groupby("category")["amount"].agg(["mean", "std"]).reset_index()
    cat_stats.columns = ["category", "cat_mean", "cat_std"]
    df = df.merge(cat_stats, on="category", how="left")
    df["cat_std"] = df["cat_std"].fillna(1).replace(0, 1)
    df["z_score"] = (df["amount"] - df["cat_mean"]) / df["cat_std"]

    features = df[["amount", "day_of_week", "day_of_month", "z_score"]].fillna(0)
    X = StandardScaler().fit_transform(features)

    clf = IsolationForest(contamination=0.07, random_state=42, n_estimators=100)
    df["is_anomaly"] = clf.fit_predict(X)
    df["score"] = clf.score_samples(X)

    out = []
    for _, row in df[df["is_anomaly"] == -1].sort_values("score").iterrows():
        parts = []
        if abs(row["z_score"]) > 2:
            ratio = round(abs(row["amount"]) / max(row["cat_mean"], 0.01), 1)
            parts.append(f"{ratio}× typical spend in {row['category']}")
        if row["day_of_week"] >= 5:
            parts.append("weekend transaction")
        if not parts:
            parts.append("unusual spending pattern")
        out.append({
            "id": str(row["id"]),
            "amount": float(row["amount"]),
            "category": str(row["category"]),
            "date": row["date"].strftime("%Y-%m-%d"),
            "description": str(row.get("description", "")),
            "anomalyScore": round(min(99.0, abs(float(row["score"])) * 120), 1),
            "zScore": round(float(row["z_score"]), 2),
            "reason": "; ".join(parts),
        })

    return {"anomalies": out, "totalScanned": len(df), "anomalyCount": len(out)}


@app.post("/suggest-budgets")
def suggest_budgets(req: BudgetSuggestReq):
    if not req.monthly_spending:
        raise HTTPException(400, "No spending data provided")

    df = pd.DataFrame([s.model_dump() for s in req.monthly_spending])
    suggestions = []

    for cat, group in df.groupby("category"):
        amounts = group["amount"].values.astype(float)
        mean_val = float(np.mean(amounts))
        median_val = float(np.median(amounts))
        std_val = float(np.std(amounts))
        p75 = float(np.percentile(amounts, 75))

        trend = "stable"
        if len(amounts) >= 3:
            x = np.arange(len(amounts))
            slope = np.polyfit(x, amounts, 1)[0]
            pct = (slope / mean_val * 100) if mean_val > 0 else 0
            if pct > 3:
                trend = "increasing"
            elif pct < -3:
                trend = "decreasing"

        buffer = 1.10 if trend == "increasing" else 1.05
        suggested = round(p75 * buffer, 2)
        n = len(amounts)

        suggestions.append({
            "category": str(cat),
            "suggestedBudget": suggested,
            "historicalMean": round(mean_val, 2),
            "historicalMedian": round(median_val, 2),
            "historicalStd": round(std_val, 2),
            "p75": round(p75, 2),
            "trend": trend,
            "monthsAnalyzed": n,
            "confidence": "high" if n >= 6 else "medium" if n >= 3 else "low",
        })

    suggestions.sort(key=lambda x: x["suggestedBudget"], reverse=True)
    months_count = int(df["month"].nunique()) if "month" in df.columns else 0
    return {"suggestions": suggestions, "monthsAnalyzed": months_count}

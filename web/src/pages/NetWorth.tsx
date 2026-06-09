// Net worth dashboard with historical snapshots and multi-rate growth projections
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { fmtCADShort, fmtMoney } from '../components/charts';
import './NetWorth.css';

interface NetWorthSnapshot {
  snapshotDate: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

interface NetWorthBreakdown {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  breakdown: {
    assets: {
      cash: number;
      investments: number;
      realEstate: number;
      otherAssets: number;
    };
    liabilities: {
      mortgages: number;
      creditCard: number;
      loans: number;
      otherLiabilities: number;
    };
  };
}

// Renders net worth breakdown, history chart, and scenario projections
export default function NetWorth() {
  useAuth();
  const [current, setCurrent] = useState<NetWorthBreakdown | null>(null);
  const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(12);
  const [projYears, setProjYears] = useState(10);

  useEffect(() => {
    fetchNetWorth();
  }, [months]);

  const fetchNetWorth = async () => {
    try {
      const [currentData, historyData] = await Promise.all([
        api('/net-worth/current'),
        api(`/net-worth/history?months=${months}`),
      ]);

      setCurrent(currentData);
      setHistory(historyData.snapshots || []);
    } catch (err) {
      console.error('Error fetching net worth:', err);
    } finally {
      setLoading(false);
    }
  };

  const createSnapshot = async () => {
    try {
      await api('/net-worth/snapshot', { method: 'POST' });
      await fetchNetWorth();
    } catch (err) {
      console.error('Error creating snapshot:', err);
    }
  };

  // Projects net worth at 3%, 6%, and 9% asset growth with 5% annual debt paydown
  const scenarios = useMemo(() => {
    if (!current) return [];
    const thisYear = new Date().getFullYear();
    return Array.from({ length: projYears + 1 }, (_, i) => ({
      year: thisYear + i,
      conservative: Math.round(current.totalAssets * Math.pow(1.03, i) - current.totalLiabilities * Math.pow(0.95, i)),
      base: Math.round(current.totalAssets * Math.pow(1.06, i) - current.totalLiabilities * Math.pow(0.95, i)),
      optimistic: Math.round(current.totalAssets * Math.pow(1.09, i) - current.totalLiabilities * Math.pow(0.95, i)),
    }));
  }, [current, projYears]);

  if (loading || !current) return <div>Loading net worth data...</div>;

  const assetColors = ['#4F46E5', '#7C3AED', '#EC4899', '#F59E0B'];
  const liabilityColors = ['#EF4444', '#DC2626', '#B91C1C', '#7F1D1D'];

  const assetData = [
    { name: 'Cash', value: current.breakdown.assets.cash },
    { name: 'Investments', value: current.breakdown.assets.investments },
    { name: 'Real Estate', value: current.breakdown.assets.realEstate },
    { name: 'Other', value: current.breakdown.assets.otherAssets },
  ].filter(item => item.value > 0);

  const liabilityData = [
    { name: 'Mortgages', value: current.breakdown.liabilities.mortgages },
    { name: 'Credit Card', value: current.breakdown.liabilities.creditCard },
    { name: 'Loans', value: current.breakdown.liabilities.loans },
    { name: 'Other', value: current.breakdown.liabilities.otherLiabilities },
  ].filter(item => item.value > 0);

  const chartData = history.map((snap) => ({
    date: new Date(snap.snapshotDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
    netWorth: snap.netWorth,
    assets: snap.totalAssets,
    liabilities: snap.totalLiabilities,
  }));

  return (
    <div className="net-worth-container">
      <div className="net-worth-header">
        <h1>Net Worth Tracking</h1>
        <button className="btn-primary" onClick={createSnapshot}>
          📸 Take Snapshot
        </button>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">Total Assets</div>
          <div className="summary-value" style={{ color: '#059669' }}>+{fmtMoney(current.totalAssets)}</div>
          <div className="summary-change">↑ {fmtMoney(current.breakdown.assets.cash)} cash</div>
        </div>

        <div className="summary-card">
          <div className="summary-label">Total Liabilities</div>
          <div className="summary-value" style={{ color: '#dc2626' }}>−{fmtMoney(current.totalLiabilities)}</div>
          <div className="summary-change">↓ {fmtMoney(current.breakdown.liabilities.loans)} loans</div>
        </div>

        <div className="summary-card net-worth-card">
          <div className="summary-label">Net Worth</div>
          <div className="summary-value" style={{ color: current.netWorth >= 0 ? '#059669' : '#dc2626' }}>
            {current.netWorth >= 0 ? '+' : '−'}{fmtMoney(Math.abs(current.netWorth))}
          </div>
          <div className="summary-change">Your financial position</div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        {assetData.length > 0 && (
          <div className="chart-card">
            <h3>Asset Breakdown</h3>
            <div style={{ width: "100%", minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={assetData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {assetData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={assetColors[index % assetColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => fmtMoney(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            </div>
          </div>
        )}

        {liabilityData.length > 0 && (
          <div className="chart-card">
            <h3>Liability Breakdown</h3>
            <div style={{ width: "100%", minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={liabilityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {liabilityData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={liabilityColors[index % liabilityColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => fmtMoney(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Trends */}
      {chartData.length > 1 && (
        <div className="trends-card">
          <div className="trends-header">
            <h3>Net Worth Trend</h3>
            <select value={months} onChange={(e) => setMonths(parseInt(e.target.value))}>
              <option value={3}>Last 3 Months</option>
              <option value={6}>Last 6 Months</option>
              <option value={12}>Last Year</option>
              <option value={24}>Last 2 Years</option>
            </select>
          </div>
          <div style={{ width: "100%", minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: any) => fmtMoney(Number(value))} />
              <Legend />
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="#4F46E5"
                dot={{ fill: '#4F46E5' }}
                strokeWidth={2}
                name="Net Worth"
              />
              <Line
                type="monotone"
                dataKey="assets"
                stroke="#10B981"
                dot={{ fill: '#10B981' }}
                strokeWidth={2}
                name="Assets"
              />
              <Line
                type="monotone"
                dataKey="liabilities"
                stroke="#EF4444"
                dot={{ fill: '#EF4444' }}
                strokeWidth={2}
                name="Liabilities"
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3-Scenario Projection */}
      {scenarios.length > 1 && (
        <div className="trends-card">
          <div className="trends-header">
            <h3>3-Scenario Net Worth Projection</h3>
            <select value={projYears} onChange={(e) => setProjYears(parseInt(e.target.value))}>
              <option value={5}>5 Years</option>
              <option value={10}>10 Years</option>
              <option value={20}>20 Years</option>
              <option value={30}>30 Years</option>
            </select>
          </div>
          <div style={{ width: "100%", minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={scenarios}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => fmtCADShort(v)} />
              <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="optimistic" stroke="#10B981" strokeWidth={2} name="Optimistic (9%)" dot={false} />
              <Line type="monotone" dataKey="base" stroke="#4F46E5" strokeWidth={2} name="Base (6%)" dot={false} />
              <Line type="monotone" dataKey="conservative" stroke="#F59E0B" strokeWidth={2} name="Conservative (3%)" dot={false} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-light)", marginTop: 8 }}>
            Assets grow at each scenario rate; liabilities amortize ~5%/yr. For planning purposes only.
          </p>
        </div>
      )}

      {/* Breakdown Table */}
      <div className="breakdown-section">
        <div className="breakdown-column">
          <h3>Assets</h3>
          <div className="breakdown-list">
            {Object.entries(current.breakdown.assets).map(([key, value]) => (
              <div key={key} className="breakdown-item">
                <span className="breakdown-label">{key.split(/(?=[A-Z])/).join(' ')}</span>
                <span className="breakdown-value" style={{ color: '#059669' }}>+{fmtMoney(value)}</span>
              </div>
            ))}
            <div className="breakdown-item total">
              <span className="breakdown-label">Total Assets</span>
              <span className="breakdown-value" style={{ color: '#059669', fontWeight: 700 }}>+{fmtMoney(current.totalAssets)}</span>
            </div>
          </div>
        </div>

        <div className="breakdown-column">
          <h3>Liabilities</h3>
          <div className="breakdown-list">
            {Object.entries(current.breakdown.liabilities).map(([key, value]) => (
              <div key={key} className="breakdown-item">
                <span className="breakdown-label">{key.split(/(?=[A-Z])/).join(' ')}</span>
                <span className="breakdown-value" style={{ color: '#dc2626' }}>−{fmtMoney(value)}</span>
              </div>
            ))}
            <div className="breakdown-item total">
              <span className="breakdown-label">Total Liabilities</span>
              <span className="breakdown-value" style={{ color: '#dc2626', fontWeight: 700 }}>−{fmtMoney(current.totalLiabilities)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

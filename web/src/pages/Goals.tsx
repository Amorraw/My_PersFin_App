import { useState } from 'react';
import { useFinancialData } from '../contexts/FinancialDataContext';
import { api } from '../api';
import './Goals.css';
import { ProgressGauge, GaugeRow, fmtMoney } from '../components/charts';
import type { Goal } from '../types';

// Top financial goals most people set, mapped to this app's existing goal
// categories — picking one prefills the name/category below (still editable).
const GOAL_PRESETS: { label: string; name: string; category: string }[] = [
  { label: 'Emergency Fund',            name: 'Emergency Fund',            category: 'emergency-fund' },
  { label: 'Pay Off Debt',              name: 'Pay Off Debt',              category: 'debt-payoff' },
  { label: 'Down Payment for a Home',   name: 'Down Payment for a Home',   category: 'home' },
  { label: 'Home Renovation',           name: 'Home Renovation',           category: 'home' },
  { label: 'New Car',                   name: 'New Car',                   category: 'car' },
  { label: 'Retirement Savings',        name: 'Retirement Savings',        category: 'investment' },
  { label: 'Education / Tuition Fund',  name: 'Education / Tuition Fund',  category: 'education' },
  { label: 'Wedding',                   name: 'Wedding',                   category: 'other' },
  { label: 'Vacation / Travel',         name: 'Vacation / Travel',         category: 'vacation' },
  { label: 'Starting a Business',       name: 'Starting a Business',       category: 'other' },
];
const OTHER_GOAL_TYPE = '__other__';

export default function Goals() {
  const { goals, loading, refresh: refreshFinancials, monthlySurplus, totalRecommendedMonthlyGoals, goalsOverCapacity } = useFinancialData();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<string>(OTHER_GOAL_TYPE);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'other',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    priority: 'medium',
    monthlyContribution: '',
    notes: '',
  });

  const handleGoalTypeChange = (value: string) => {
    setGoalType(value);
    if (value === OTHER_GOAL_TYPE) {
      setFormData(prev => ({ ...prev, name: '' }));
      return;
    }
    const preset = GOAL_PRESETS.find(p => p.label === value);
    if (preset) setFormData(prev => ({ ...prev, name: preset.name, category: preset.category }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...formData,
        targetAmount: parseFloat(formData.targetAmount),
        currentAmount: parseFloat(formData.currentAmount || '0'),
        monthlyContribution: formData.monthlyContribution ? parseFloat(formData.monthlyContribution) : undefined,
      };

      if (editingId) {
        await api(`/goals/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/goals', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setFormData({
        name: '',
        description: '',
        category: 'other',
        targetAmount: '',
        currentAmount: '',
        targetDate: '',
        priority: 'medium',
        monthlyContribution: '',
        notes: '',
      });
      setGoalType(OTHER_GOAL_TYPE);
      setEditingId(null);
      setShowForm(false);
      refreshFinancials();
    } catch (err) {
      console.error('Error saving goal:', err);
      alert('Failed to save goal');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this goal?')) {
      try {
        await api(`/goals/${id}`, { method: 'DELETE' });
        refreshFinancials();
      } catch (err) {
        console.error('Error deleting goal:', err);
      }
    }
  };

  const handleEdit = (goal: Goal) => {
    setFormData({
      name: goal.name,
      description: goal.description || '',
      category: goal.category,
      targetAmount: goal.targetAmount.toString(),
      currentAmount: goal.currentAmount.toString(),
      targetDate: goal.targetDate.split('T')[0],
      priority: goal.priority,
      monthlyContribution: '',
      notes: '',
    });
    const matchedPreset = GOAL_PRESETS.find(p => p.name === goal.name);
    setGoalType(matchedPreset ? matchedPreset.label : OTHER_GOAL_TYPE);
    setEditingId(goal._id);
    setShowForm(true);
  };

  const handleAddProgress = async (id: string, amount: number) => {
    try {
      await api(`/goals/${id}/progress`, {
        method: 'PATCH',
        body: JSON.stringify({ amount }),
      });
      refreshFinancials();
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  };

  const priorityColors = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' };
  const categoryIcons: any = {
    home: '🏠',
    car: '🚗',
    vacation: '✈️',
    education: '📚',
    'emergency-fund': '🚨',
    investment: '📈',
    'debt-payoff': '💳',
    other: '💰',
  };

  if (loading) return <div>Loading goals...</div>;

  return (
    <div className="goals-container">
      <div className="goals-header">
        <h1>Financial Goals</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setGoalType(OTHER_GOAL_TYPE);
            setFormData({
              name: '',
              description: '',
              category: 'other',
              targetAmount: '',
              currentAmount: '',
              targetDate: '',
              priority: 'medium',
              monthlyContribution: '',
              notes: '',
            });
          }}
        >
          {showForm ? 'Cancel' : '+ Add Goal'}
        </button>
      </div>

      {showForm && (
        <form className="goal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Goal Type</label>
            <select value={goalType} onChange={(e) => handleGoalTypeChange(e.target.value)}>
              {GOAL_PRESETS.map(p => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
              <option value={OTHER_GOAL_TYPE}>Other</option>
            </select>
            <small className="form-hint">
              Pick a common goal to prefill the name and category below — both stay editable — or choose "Other" to enter your own.
            </small>
          </div>

          <div className="form-group">
            <label>Goal Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="home">Home</option>
                <option value="car">Car</option>
                <option value="vacation">Vacation</option>
                <option value="education">Education</option>
                <option value="emergency-fund">Emergency Fund</option>
                <option value="investment">Investment</option>
                <option value="debt-payoff">Debt Payoff</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Target Amount *</label>
              <input
                type="number"
                value={formData.targetAmount}
                onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label>Current Amount</label>
              <input
                type="number"
                value={formData.currentAmount}
                onChange={(e) => setFormData({ ...formData, currentAmount: e.target.value })}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Target Date *</label>
            <input
              type="date"
              value={formData.targetDate}
              onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <button type="submit" className="btn-primary">
            {editingId ? 'Update Goal' : 'Create Goal'}
          </button>
        </form>
      )}

      {goalsOverCapacity && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: "1rem", fontSize: 13 }}>
          <p style={{ margin: 0, color: "#b45309", fontWeight: 600 }}>
            ⚠️ Your active goals need {fmtMoney(totalRecommendedMonthlyGoals)}/month combined, but your current cash-flow surplus is {fmtMoney(monthlySurplus)}/month.
          </p>
          <p style={{ margin: "6px 0 0", color: "#92400e" }}>
            💡 Consider extending a target date, lowering a target amount, or increasing your surplus (see Debt Optimization and Budgets) — each goal's own numbers above are left untouched.
          </p>
        </div>
      )}

      {goals.length > 0 && (
        <div style={{ background: "#fff", borderRadius: "0.75rem", padding: "1rem 1rem 0.5rem", marginBottom: "1rem", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <h3 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "1rem", color: "#374151" }}>Progress Overview</h3>
          <GaugeRow>
            {goals.slice(0, 8).map(goal => (
              <ProgressGauge
                key={goal._id}
                value={Math.min(goal.progressPercentage, 100)}
                label={goal.name}
                sublabel={`${fmtMoney(goal.currentAmount)} / ${fmtMoney(goal.targetAmount)}`}
                warnAt={50}
                dangerAt={80}
              />
            ))}
          </GaugeRow>
        </div>
      )}

      <div className="goals-grid">
        {goals.length === 0 ? (
          <p className="no-data">No goals yet. Create your first goal!</p>
        ) : (
          goals.map((goal) => (
            <div key={goal._id} className="goal-card">
              <div className="goal-header">
                <div className="goal-title">
                  <span className="goal-icon">{categoryIcons[goal.category] || '💰'}</span>
                  <div>
                    <h3>{goal.name}</h3>
                    {goal.description && <p className="goal-description">{goal.description}</p>}
                  </div>
                </div>
                <div className="goal-actions">
                  <button className="btn-icon" onClick={() => handleEdit(goal)} title="Edit">
                    ✎
                  </button>
                  <button className="btn-icon" onClick={() => handleDelete(goal._id)} title="Delete">
                    ✕
                  </button>
                </div>
              </div>

              <div className="goal-priority">
                <span
                  className="priority-badge"
                  style={{ backgroundColor: priorityColors[goal.priority as keyof typeof priorityColors] }}
                >
                  {goal.priority.toUpperCase()}
                </span>
              </div>

              <div className="goal-progress">
                <div className="progress-info">
                  <span>{fmtMoney(goal.currentAmount)}</span>
                  <span className="progress-total">{fmtMoney(goal.targetAmount)}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(goal.progressPercentage, 100)}%` }}
                  ></div>
                </div>
                <div className="progress-percentage">{Math.round(goal.progressPercentage)}% Complete</div>
              </div>

              <div className="goal-details">
                <div className="detail">
                  <span className="label">Months Remaining:</span>
                  <span className="value">{goal.monthsRemaining > 0 ? goal.monthsRemaining : 'Overdue'}</span>
                </div>
                <div className="detail">
                  <span className="label">Monthly Need:</span>
                  <span className="value">{fmtMoney(goal.recommendedMonthlyContribution)}</span>
                </div>
              </div>

              <div className="goal-actions-footer">
                <button
                  className="btn-small"
                  onClick={() => handleAddProgress(goal._id, 100)}
                >
                  + $100
                </button>
                <button
                  className="btn-small"
                  onClick={() => handleAddProgress(goal._id, 500)}
                >
                  + $500
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

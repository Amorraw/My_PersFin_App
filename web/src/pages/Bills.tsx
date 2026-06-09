// Recurring bills tracker with upcoming-due alerts and monthly cost summary
import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { fmtMoney } from '../components/charts';
import './Bills.css';

interface Bill {
  _id: string;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  dueDate: number;
  status: string;
  isAutoPay: boolean;
  nextPaymentDate: string;
  isOverdue: boolean;
  monthlyEquivalent: number;
}

interface BillsSummary {
  totalMonthly: number;
  byCategory: Record<string, number>;
  upcomingBills: Bill[];
  totalBills: number;
}

// Renders bill list with overdue flags, autopay badges, and summary cards
export default function Bills() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<BillsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'utilities',
    amount: '',
    frequency: 'monthly',
    dueDate: '1',
    paymentMethod: 'bank-transfer',
    reminderDaysBefore: '3',
    isAutoPay: false,
    notes: '',
  });

  useEffect(() => {
    setShowForm(false);
    setEditingId(null);
    fetchBills();
  }, [statusFilter]);

  const fetchBills = async () => {
    try {
      setError(null);
      const [billsData, summaryData] = await Promise.all([
        api(`/bills?status=${statusFilter}`),
        api('/bills/summary'),
      ]);
      setBills(billsData.bills || []);
      setSummary(summaryData.summary || null);
    } catch (err) {
      console.error('Error fetching bills:', err);
      setError(err instanceof Error ? err.message : 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        dueDate: parseInt(formData.dueDate),
        reminderDaysBefore: parseInt(formData.reminderDaysBefore),
      };

      if (editingId) {
        await api(`/bills/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/bills', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setFormData({
        name: '',
        description: '',
        category: 'utilities',
        amount: '',
        frequency: 'monthly',
        dueDate: '1',
        paymentMethod: 'bank-transfer',
        reminderDaysBefore: '3',
        isAutoPay: false,
        notes: '',
      });
      setEditingId(null);
      setShowForm(false);
      fetchBills();
    } catch (err) {
      console.error('Error saving bill:', err);
      alert('Failed to save bill');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this bill?')) {
      try {
        await api(`/bills/${id}`, { method: 'DELETE' });
        fetchBills();
      } catch (err) {
        console.error('Error deleting bill:', err);
      }
    }
  };

  const handleEdit = (bill: Bill) => {
    setFormData({
      name: bill.name,
      description: '',
      category: bill.category,
      amount: bill.amount.toString(),
      frequency: bill.frequency,
      dueDate: bill.dueDate.toString(),
      paymentMethod: 'bank-transfer',
      reminderDaysBefore: '3',
      isAutoPay: bill.isAutoPay,
      notes: '',
    });
    setEditingId(bill._id);
    setShowForm(true);
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api(`/bills/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      fetchBills();
    } catch (err) {
      console.error('Error updating bill status:', err);
    }
  };

  const categoryEmojis: any = {
    utilities: '💡',
    subscription: '📺',
    insurance: '🛡️',
    'rent-mortgage': '🏠',
    phone: '📱',
    internet: '🌐',
    transportation: '🚗',
    other: '📝',
  };

  if (loading) return <div className="loading-state">Loading bills...</div>;
  if (error) return <div className="error-state">Error: {error}</div>;

  return (
    <div className="bills-container">
      <div className="bills-header">
        <h1>Bill Management</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setFormData({
              name: '',
              description: '',
              category: 'utilities',
              amount: '',
              frequency: 'monthly',
              dueDate: '1',
              paymentMethod: 'bank-transfer',
              reminderDaysBefore: '3',
              isAutoPay: false,
              notes: '',
            });
          }}
        >
          {showForm ? 'Cancel' : '+ Add Bill'}
        </button>
      </div>

      {summary && (
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-label">Total Monthly</div>
            <div className="summary-value">{fmtMoney(summary.totalMonthly)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Active Bills</div>
            <div className="summary-value">{summary.totalBills}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Next Payment</div>
            <div className="summary-value">
              {summary.upcomingBills.length > 0 ? new Date(summary.upcomingBills[0].nextPaymentDate).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <form className="bill-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Bill Name *</label>
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
                <option value="utilities">Utilities</option>
                <option value="subscription">Subscription</option>
                <option value="insurance">Insurance</option>
                <option value="rent-mortgage">Rent/Mortgage</option>
                <option value="phone">Phone</option>
                <option value="internet">Internet</option>
                <option value="transportation">Transportation</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Frequency</label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount *</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label>Due Date (Day of Month) *</label>
              <input
                type="number"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                required
                min="1"
                max="31"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Payment Method</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
              >
                <option value="bank-transfer">Bank Transfer</option>
                <option value="credit-card">Credit Card</option>
                <option value="debit">Debit</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Reminder (Days Before)</label>
              <input
                type="number"
                value={formData.reminderDaysBefore}
                onChange={(e) => setFormData({ ...formData, reminderDaysBefore: e.target.value })}
                min="0"
              />
            </div>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.isAutoPay}
                onChange={(e) => setFormData({ ...formData, isAutoPay: e.target.checked })}
              />
              Auto Pay Enabled
            </label>
          </div>

          <button type="submit" className="btn-primary">
            {editingId ? 'Update Bill' : 'Create Bill'}
          </button>
        </form>
      )}

      <div className="filters">
        <button
          className={`filter-btn ${statusFilter === 'active' ? 'active' : ''}`}
          onClick={() => setStatusFilter('active')}
        >
          Active
        </button>
        <button
          className={`filter-btn ${statusFilter === 'paused' ? 'active' : ''}`}
          onClick={() => setStatusFilter('paused')}
        >
          Paused
        </button>
        <button
          className={`filter-btn ${statusFilter === 'cancelled' ? 'active' : ''}`}
          onClick={() => setStatusFilter('cancelled')}
        >
          Cancelled
        </button>
      </div>

      <div className="bills-list">
        {bills.length === 0 ? (
          <p className="no-data">No bills found</p>
        ) : (
          bills.map((bill) => (
            <div key={bill._id} className={`bill-item ${bill.isOverdue ? 'overdue' : ''}`}>
              <div className="bill-icon">{categoryEmojis[bill.category] || '📝'}</div>

              <div className="bill-info">
                <div className="bill-name">{bill.name}</div>
                <div className="bill-details">
                  <span className="frequency-badge">{bill.frequency}</span>
                  <span className="monthly-equiv">≈ {fmtMoney(bill.monthlyEquivalent)}/mo</span>
                </div>
              </div>

              <div className="bill-amount">{fmtMoney(bill.amount)}</div>

              <div className="bill-due">
                <div className="due-label">
                  {bill.isOverdue ? '⚠️ Overdue' : `Due: ${new Date(bill.nextPaymentDate).toLocaleDateString()}`}
                </div>
                {bill.isAutoPay && <div className="auto-pay-badge">Auto Pay</div>}
              </div>

              <div className="bill-actions">
                <button className="btn-icon" onClick={() => handleEdit(bill)} title="Edit">
                  ✎
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleStatusChange(bill._id, bill.status === 'active' ? 'paused' : 'active')}
                  title={bill.status === 'active' ? 'Pause' : 'Resume'}
                >
                  {bill.status === 'active' ? '⏸' : '▶'}
                </button>
                <button className="btn-icon" onClick={() => handleDelete(bill._id)} title="Delete">
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {summary && (
        <div className="category-breakdown">
          <h2>Monthly Breakdown by Category</h2>
          <div className="category-grid">
            {Object.entries(summary.byCategory).map(([category, amount]) => (
              <div key={category} className="category-item">
                <span className="category-name">{category}</span>
                <span className="category-amount">{fmtMoney(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

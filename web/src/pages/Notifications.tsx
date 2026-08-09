// In-app notification centre for RRSP, TFSA, bill, budget, and spending alerts
import { useState, useEffect, useCallback } from "react";
import './Notifications.css';

type AlertCategory = "rrsp" | "tfsa" | "bill" | "budget" | "net_worth" | "spending" | "automation";
type Severity = "info" | "warning" | "critical";

interface Notification {
  _id: string;
  category: AlertCategory;
  title: string;
  message: string;
  severity: Severity;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  rrsp: "RRSP",
  tfsa: "TFSA",
  bill: "Bills",
  budget: "Budget",
  net_worth: "Net Worth",
  spending: "Spending",
  automation: "Automation",
};

const CATEGORY_COLORS: Record<AlertCategory, string> = {
  rrsp: "#2563eb",
  tfsa: "#7c3aed",
  bill: "#dc2626",
  budget: "#d97706",
  net_worth: "#059669",
  spending: "#ea580c",
  automation: "#6b7280",
};

const SEV_ICONS: Record<Severity, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🔴",
};

// Renders filterable notification list with read/dismiss and bulk-read actions
export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterCategory, setFilterCategory] = useState<AlertCategory | "all">("all");
  const [filterUnread, setFilterUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterCategory !== "all") params.set("category", filterCategory);
    if (filterUnread) params.set("unread", "true");

    const res = await fetch(`/api/notifications?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
    setLoading(false);
  }, [filterCategory, filterUnread]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PUT", credentials: "include" });
    setNotifications((prev) => prev.map((n) => n._id === id ? { ...n, isRead: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "PUT", credentials: "include" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const dismiss = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" });
    const n = notifications.find((x) => x._id === id);
    setNotifications((prev) => prev.filter((x) => x._id !== id));
    if (n && !n.isRead) setUnreadCount((c) => Math.max(0, c - 1));
  };

  const dismissAll = async () => {
    if (!window.confirm("Dismiss all notifications?")) return;
    await fetch("/api/notifications", { method: "DELETE", credentials: "include" });
    setNotifications([]);
    setUnreadCount(0);
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetch("/api/notifications/refresh", { method: "POST", credentials: "include" });
    await fetchNotifications();
    setRefreshing(false);
  };

  const categories: (AlertCategory | "all")[] = ["all", "rrsp", "tfsa", "bill", "budget", "net_worth", "spending", "automation"];

  return (
    <div className="notifications-container">
      <div className="notif-page-header">
        <div>
          <h1>Notifications</h1>
          {unreadCount > 0 && (
            <span className="notif-unread-count">{unreadCount} unread</span>
          )}
        </div>
        <div className="notif-header-actions">
          <button className="notif-action-btn" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh Alerts"}
          </button>
          {unreadCount > 0 && (
            <button className="notif-action-btn" onClick={markAllRead}>
              Mark All Read
            </button>
          )}
          {notifications.length > 0 && (
            <button className="notif-action-btn danger" onClick={dismissAll}>
              Dismiss All
            </button>
          )}
        </div>
      </div>

      <div className="notif-filters">
        <div className="notif-pills">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`notif-pill${filterCategory === cat ? " active" : ""}`}
            >
              {cat === "all" ? "All" : CATEGORY_LABELS[cat as AlertCategory]}
            </button>
          ))}
        </div>
        <label className="notif-unread-filter">
          <input
            type="checkbox"
            checked={filterUnread}
            onChange={(e) => setFilterUnread(e.target.checked)}
          />
          Unread only
        </label>
      </div>

      {loading ? (
        <div className="notif-loading">Loading…</div>
      ) : notifications.length === 0 ? (
        <div className="notif-empty-state">
          <div className="notif-empty-icon">🔔</div>
          <p>No notifications</p>
          <p className="notif-empty-hint">Click "Refresh Alerts" to check for new alerts</p>
        </div>
      ) : (
        <div className="notif-list">
          {notifications.map((n) => (
            <div
              key={n._id}
              className={`notif-item${!n.isRead ? ` unread sev-${n.severity}` : ""}`}
              onClick={() => { if (!n.isRead) markRead(n._id); }}
            >
              <div className="notif-icon">{SEV_ICONS[n.severity]}</div>
              <div className="notif-body">
                <div className="notif-meta-row">
                  <span
                    className="notif-category-badge"
                    style={{
                      background: CATEGORY_COLORS[n.category] + "20",
                      color: CATEGORY_COLORS[n.category],
                    }}
                  >
                    {CATEGORY_LABELS[n.category]}
                  </span>
                  {!n.isRead && <span className="notif-unread-dot" />}
                  <span className="notif-time">
                    {new Date(n.createdAt).toLocaleDateString("en-CA", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className={`notif-title${!n.isRead ? " unread" : ""}`}>{n.title}</div>
                <div className="notif-message">{n.message}</div>
              </div>
              <button
                className="notif-dismiss-btn"
                onClick={(e) => { e.stopPropagation(); dismiss(n._id); }}
                title="Dismiss"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="notif-legend">
        <div className="notif-legend-title">Alert Types</div>
        <div className="notif-legend-grid">
          {[
            { icon: "⚠️", label: "RRSP room running low (< $500 remaining)" },
            { icon: "🔴", label: "TFSA over-contribution detected" },
            { icon: "🔴", label: "Bill due within reminder window" },
            { icon: "⚠️", label: "Budget 80% or 100% used" },
            { icon: "ℹ️", label: "Net worth milestone crossed" },
            { icon: "⚠️", label: "Unusual spending spike (50%+ vs last month)" },
            { icon: "ℹ️", label: "Monthly net worth snapshot taken" },
            { icon: "ℹ️", label: "Budget rollover available" },
          ].map((item, i) => (
            <div key={i} className="notif-legend-item">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

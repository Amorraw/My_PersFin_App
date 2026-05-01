import { useState, useEffect, useCallback } from "react";

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

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; icon: string }> = {
  info: { bg: "#eff6ff", border: "#bfdbfe", icon: "ℹ️" },
  warning: { bg: "#fffbeb", border: "#fde68a", icon: "⚠️" },
  critical: { bg: "#fef2f2", border: "#fecaca", icon: "🔴" },
};

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
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Notifications</h1>
          {unreadCount > 0 && (
            <span style={{ fontSize: 14, color: "#6b7280" }}>{unreadCount} unread</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db",
              background: "white", cursor: "pointer", fontSize: 13,
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh Alerts"}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db",
                background: "white", cursor: "pointer", fontSize: 13,
              }}
            >
              Mark All Read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={dismissAll}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid #fecaca",
                background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 13,
              }}
            >
              Dismiss All
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: filterCategory === cat ? "2px solid #2563eb" : "1px solid #d1d5db",
                background: filterCategory === cat ? "#eff6ff" : "white",
                color: filterCategory === cat ? "#2563eb" : "#374151",
                fontWeight: filterCategory === cat ? 600 : 400,
              }}
            >
              {cat === "all" ? "All" : CATEGORY_LABELS[cat as AlertCategory]}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>
          <input
            type="checkbox"
            checked={filterUnread}
            onChange={(e) => setFilterUnread(e.target.checked)}
          />
          Unread only
        </label>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>Loading…</div>
      ) : notifications.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 48, background: "#f9fafb",
          borderRadius: 12, border: "1px dashed #d1d5db",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          <div style={{ fontSize: 16, color: "#6b7280" }}>No notifications</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>
            Click "Refresh Alerts" to check for new alerts
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notifications.map((n) => {
            const sev = SEVERITY_STYLES[n.severity];
            return (
              <div
                key={n._id}
                style={{
                  background: n.isRead ? "white" : sev.bg,
                  border: `1px solid ${n.isRead ? "#e5e7eb" : sev.border}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  cursor: n.isRead ? "default" : "pointer",
                }}
                onClick={() => { if (!n.isRead) markRead(n._id); }}
              >
                <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{sev.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                        background: CATEGORY_COLORS[n.category] + "20",
                        color: CATEGORY_COLORS[n.category],
                        textTransform: "uppercase", letterSpacing: "0.05em",
                      }}
                    >
                      {CATEGORY_LABELS[n.category]}
                    </span>
                    {!n.isRead && (
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%", background: "#2563eb",
                        display: "inline-block", flexShrink: 0,
                      }} />
                    )}
                    <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>
                      {new Date(n.createdAt).toLocaleDateString("en-CA", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div style={{ fontWeight: n.isRead ? 500 : 700, fontSize: 14, marginBottom: 4 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{n.message}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(n._id); }}
                  title="Dismiss"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#9ca3af", fontSize: 18, lineHeight: 1, flexShrink: 0,
                    padding: "0 4px",
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div style={{
        marginTop: 32, padding: 16, background: "#f9fafb", borderRadius: 10,
        border: "1px solid #e5e7eb",
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#374151" }}>Alert Types</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
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
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 }}>
              <span>{item.icon}</span>
              <span style={{ color: "#6b7280" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

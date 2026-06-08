import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { api } from "../api";
import "../styles/Header.css";

const DEMO_PROFILE_TITLES = [
  "The Overwhelmed Graduate",
  "The Over-Leveraged",
  "The Single Parent",
  "The Young Professional",
  "The Average Canadian",
  "The Comfortable Professional",
  "The Power Saver (DINK)",
  "The Business Owner",
  "The Pre-Retiree",
  "The High Net Worth Executive",
];

interface HeaderProps {
  onSearchOpen?: () => void;
  onMenuToggle?: () => void;
}

export default function Header({ onSearchOpen, onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [demoAction, setDemoAction] = useState<string | null>(null);

  const hasDemoProfile = !!(user?.demoProfileIndex);
  const demoTitle = hasDemoProfile
    ? DEMO_PROFILE_TITLES[(user!.demoProfileIndex as number) - 1]
    : null;

  async function handleDemoAction(action: "regenerate" | "reset" | "clear") {
    const msgs: Record<string, string> = {
      regenerate: "Generate a completely new random dataset for this profile? Your current data will be replaced.",
      reset:      "Restore data to your last Regenerated state? Any edits you've made since then will be undone.",
      clear:      "Delete ALL data and unlink this profile? This cannot be undone.",
    };
    if (!window.confirm(msgs[action])) return;
    setDemoAction(action);
    try {
      await api(`/demo/${action}`, { method: "POST" });
      window.location.reload();
    } catch (err: any) {
      alert(err.message ?? "Something went wrong.");
      setDemoAction(null);
    }
  }

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/notifications?unread=true", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.unreadCount ?? 0);
        }
      } catch { /* silently ignore */ }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      setIsLoggingOut(true);
      setShowDropdown(false);
      try {
        await logout();
        navigate("/login", { replace: true });
      } catch (err) {
        console.error("Logout error:", err);
        alert("Logout failed. Please try again.");
        setIsLoggingOut(false);
        setShowDropdown(false);
      }
    }
  };

  return (
    <header className="header">
      <div className="header-content">

        {/* Left — title + mobile hamburger */}
        <div className="header-left">
          <button
            className="hamburger-btn"
            onClick={onMenuToggle}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <span className="header-title">Your Personal Finance Web App</span>
        </div>

        {/* Centre — search */}
        <button
          className="header-search-btn"
          onClick={onSearchOpen}
          title="Search (Ctrl+K)"
        >
          <span>🔍</span>
          <span className="header-search-label">Search pages…</span>
          <kbd className="header-search-kbd">⌘K</kbd>
        </button>

        {/* Right — dark mode, notifications, profile */}
        <div className="header-actions">
          <button
            className="header-icon-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <Link
            to="/notifications"
            title="Notifications"
            className="header-icon-btn header-notif"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="notif-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>

          <div className="user-dropdown">
            <button
              className="user-menu-btn"
              onClick={() => setShowDropdown(!showDropdown)}
              title={user?.email}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="user-email-label">{user?.email}</span>
            </button>
            {showDropdown && (
              <div className="dropdown-menu">
                <div className="dropdown-item email">{user?.email}</div>
                <hr />
                <button className="dropdown-item logout-btn" onClick={handleLogout} disabled={isLoggingOut}>
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Demo profile bar — full-width dark navy strip at the bottom of the header */}
      {hasDemoProfile && (
        <div style={{
          background: "#0f172a",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "5px 1.25rem",
          flexWrap: "wrap",
          fontSize: "12px",
          fontWeight: 600,
          color: "#fff",
        }}>
          <span style={{
            background: "#fff",
            color: "#0f172a",
            borderRadius: 4,
            padding: "1px 7px",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.05em",
            flexShrink: 0,
          }}>
            DEMO ONLY
          </span>
          <span style={{ flexShrink: 0, opacity: 0.9 }}>{demoTitle}</span>
          <div style={{ flex: 1 }} />
          {(["regenerate", "reset", "clear"] as const).map(action => (
            <button
              key={action}
              disabled={!!demoAction}
              onClick={() => handleDemoAction(action)}
              style={{
                padding: "3px 11px",
                borderRadius: 5,
                border: "1.5px solid rgba(255,255,255,0.7)",
                background: demoAction === action ? "rgba(255,255,255,0.3)" : "transparent",
                color: "#fff",
                cursor: demoAction ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: "11px",
                whiteSpace: "nowrap",
                opacity: demoAction && demoAction !== action ? 0.5 : 1,
              }}
            >
              {demoAction === action
                ? "Working…"
                : action === "regenerate" ? "Regenerate"
                : action === "reset"      ? "Reset Data"
                : "Clear Data"}
            </button>
          ))}
          <Link
            to="/demo-profiles"
            style={{ color: "rgba(255,255,255,0.8)", fontSize: "11px", marginLeft: 4, textDecoration: "underline" }}
          >
            Switch Profile
          </Link>
        </div>
      )}

    </header>
  );
}

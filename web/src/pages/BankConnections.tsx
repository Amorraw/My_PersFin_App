import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

interface PlaidAccount {
  plaidAccountId: string;
  name: string;
  officialName?: string;
  type: string;
  subtype: string;
  mask?: string;
  currentBalance?: number;
  availableBalance?: number;
}

interface BankConnection {
  _id: string;
  institutionName: string;
  institutionId: string;
  accounts: PlaidAccount[];
  status: "active" | "error" | "disconnected";
  errorCode?: string;
  lastSyncedAt?: string;
  transactionsSynced: number;
  createdAt: string;
}

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string, metadata: any) => void;
        onExit: (err: any, metadata: any) => void;
        onLoad?: () => void;
        onEvent?: (eventName: string, metadata: any) => void;
      }) => { open: () => void; destroy: () => void };
    };
  }
}

export default function BankConnections() {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [plaidConfigured, setPlaidConfigured] = useState(false);
  const [plaidEnv, setPlaidEnv] = useState("sandbox");
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const data = await api("/plaid/connections");
      setConnections(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load connections");
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const status = await api("/plaid/status");
        setPlaidConfigured(status.configured);
        setPlaidEnv(status.env ?? "sandbox");
        await loadConnections();
      } catch (err: any) {
        setError(err.message ?? "Failed to initialize");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [loadConnections]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function handleConnect() {
    if (!window.Plaid) {
      setError("Plaid script not loaded yet — please refresh the page.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const { link_token } = await api("/plaid/create-link-token", { method: "POST" });

      const handler = window.Plaid.create({
        token: link_token,
        onSuccess: async (publicToken, metadata) => {
          try {
            const institution = metadata?.institution ?? {};
            const result = await api("/plaid/exchange-token", {
              method: "POST",
              body: JSON.stringify({
                publicToken,
                institutionId: institution.institution_id ?? "",
                institutionName: institution.name ?? "Connected Bank",
              }),
            });
            flash(`Connected to ${result.institution ?? "bank"} — ${result.accounts} account(s) linked`);
            await loadConnections();
          } catch (err: any) {
            setError(err.message ?? "Failed to connect bank");
          } finally {
            setConnecting(false);
          }
        },
        onExit: (err) => {
          setConnecting(false);
          if (err) setError(err.display_message ?? err.error_message ?? "Connection cancelled");
        },
      });

      handler.open();
    } catch (err: any) {
      setError(err.message ?? "Failed to start bank connection");
      setConnecting(false);
    }
  }

  async function handleSync(connectionId: string) {
    setSyncingId(connectionId);
    setError(null);
    try {
      const result = await api(`/plaid/sync/${connectionId}`, { method: "POST" });
      flash(`Synced ${result.imported} new transaction(s)`);
      await loadConnections();
    } catch (err: any) {
      setError(err.message ?? "Sync failed");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleSyncAll() {
    setSyncingAll(true);
    setError(null);
    try {
      const result = await api("/plaid/sync-all", { method: "POST" });
      flash(`Sync complete — ${result.totalImported} new transaction(s) across ${result.results.length} bank(s)`);
      await loadConnections();
    } catch (err: any) {
      setError(err.message ?? "Sync all failed");
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleRemove(connectionId: string, name: string) {
    if (!confirm(`Remove ${name}? This disconnects the bank but keeps existing transactions.`)) return;
    setRemovingId(connectionId);
    setError(null);
    try {
      await api(`/plaid/connections/${connectionId}`, { method: "DELETE" });
      flash(`${name} disconnected`);
      setConnections((prev) => prev.filter((c) => c._id !== connectionId));
    } catch (err: any) {
      setError(err.message ?? "Failed to remove connection");
    } finally {
      setRemovingId(null);
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString("en-CA", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function formatBalance(amount?: number) {
    if (amount == null) return "—";
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
  }

  if (loading) {
    return (
      <div className="page-container">
        <h1>Bank Connections</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>Bank Connections</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary, #666)", fontSize: 14 }}>
            Connect your Canadian bank accounts to automatically import transactions
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {connections.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={handleSyncAll}
              disabled={syncingAll}
            >
              {syncingAll ? "Syncing…" : "Sync All"}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={connecting || !plaidConfigured}
            title={!plaidConfigured ? "Plaid credentials not configured" : undefined}
          >
            {connecting ? "Opening…" : "+ Connect Bank"}
          </button>
        </div>
      </div>

      {/* Environment badge */}
      {plaidEnv === "sandbox" && (
        <div style={{
          background: "var(--warning-bg, #fff8e1)",
          border: "1px solid var(--warning-border, #ffd54f)",
          borderRadius: 8,
          padding: "10px 16px",
          marginBottom: 20,
          fontSize: 14,
          color: "var(--warning-text, #5d4037)",
        }}>
          <strong>Sandbox Mode</strong> — Use Plaid test credentials (username: <code>user_good</code>, password: <code>pass_good</code>) to connect a simulated bank.
        </div>
      )}

      {/* Plaid not configured warning */}
      {!plaidConfigured && (
        <div style={{
          background: "var(--error-bg, #ffebee)",
          border: "1px solid var(--error-border, #ef9a9a)",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 14,
          color: "var(--error-text, #b71c1c)",
        }}>
          <strong>Plaid not configured.</strong> Add <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> to <code>server/.env</code> to enable bank connections.
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          background: "var(--error-bg, #ffebee)",
          border: "1px solid var(--error-border, #ef9a9a)",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 14,
          color: "var(--error-text, #b71c1c)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div style={{
          background: "var(--success-bg, #e8f5e9)",
          border: "1px solid var(--success-border, #a5d6a7)",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 14,
          color: "var(--success-text, #1b5e20)",
        }}>
          {successMsg}
        </div>
      )}

      {/* Empty state */}
      {connections.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          border: "2px dashed var(--border, #e0e0e0)",
          borderRadius: 12,
          color: "var(--text-secondary, #666)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏦</div>
          <h3 style={{ margin: "0 0 8px" }}>No banks connected</h3>
          <p style={{ margin: "0 0 24px" }}>Connect your bank to automatically import and categorize transactions.</p>
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={connecting || !plaidConfigured}
          >
            {connecting ? "Opening…" : "+ Connect Your First Bank"}
          </button>
        </div>
      )}

      {/* Connection cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {connections.map((conn) => (
          <div
            key={conn._id}
            style={{
              background: "var(--card-bg, #fff)",
              border: "1px solid var(--border, #e0e0e0)",
              borderRadius: 12,
              padding: 20,
            }}
          >
            {/* Card header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{conn.institutionName}</h3>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 20,
                    textTransform: "uppercase",
                    background: conn.status === "active" ? "var(--success-bg, #e8f5e9)" : "var(--error-bg, #ffebee)",
                    color: conn.status === "active" ? "var(--success-text, #2e7d32)" : "var(--error-text, #c62828)",
                  }}>
                    {conn.status}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary, #666)" }}>
                  Connected {formatDate(conn.createdAt)} · {conn.transactionsSynced} transactions synced
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-secondary, #666)" }}>
                  Last synced: {formatDate(conn.lastSyncedAt)}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 13, padding: "6px 14px" }}
                  onClick={() => handleSync(conn._id)}
                  disabled={syncingId === conn._id}
                >
                  {syncingId === conn._id ? "Syncing…" : "Sync"}
                </button>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: 13, padding: "6px 14px" }}
                  onClick={() => handleRemove(conn._id, conn.institutionName)}
                  disabled={removingId === conn._id}
                >
                  {removingId === conn._id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>

            {/* Accounts table */}
            {conn.accounts.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border, #e0e0e0)" }}>
                      <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-secondary, #666)", fontWeight: 600 }}>Account</th>
                      <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-secondary, #666)", fontWeight: 600 }}>Type</th>
                      <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-secondary, #666)", fontWeight: 600 }}>Current Balance</th>
                      <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-secondary, #666)", fontWeight: 600 }}>Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conn.accounts.map((acct) => (
                      <tr key={acct.plaidAccountId} style={{ borderBottom: "1px solid var(--border-light, #f5f5f5)" }}>
                        <td style={{ padding: "8px 10px" }}>
                          {acct.officialName ?? acct.name}
                          {acct.mask && <span style={{ color: "var(--text-secondary, #999)", marginLeft: 6 }}>••••{acct.mask}</span>}
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary, #666)", textTransform: "capitalize" }}>
                          {acct.subtype}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {formatBalance(acct.currentBalance)}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary, #666)" }}>
                          {formatBalance(acct.availableBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Error code display */}
            {conn.status === "error" && conn.errorCode && (
              <div style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "var(--error-bg, #ffebee)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--error-text, #c62828)",
              }}>
                Error: {conn.errorCode} — please reconnect this bank
              </div>
            )}
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{
        marginTop: 32,
        padding: 20,
        background: "var(--surface, #f9f9f9)",
        borderRadius: 12,
        fontSize: 14,
        color: "var(--text-secondary, #555)",
      }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 15, color: "var(--text-primary, #333)" }}>How bank connections work</h4>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Connections use <strong>Plaid</strong>, a secure bank data aggregator used by major financial apps</li>
          <li>Your banking credentials are entered directly on your bank's secure page — they are never stored here</li>
          <li>Transactions are synced automatically; click <strong>Sync</strong> to fetch the latest activity</li>
          <li>Removing a connection disconnects the bank and revokes access, but keeps your existing transactions</li>
          {plaidEnv === "sandbox" && (
            <li>In <strong>sandbox mode</strong>, use test credentials: username <code>user_good</code>, password <code>pass_good</code></li>
          )}
        </ul>
      </div>
    </div>
  );
}

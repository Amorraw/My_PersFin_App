// Plaid bank connection manager for linking accounts and syncing transactions
import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import './BankConnections.css';
import { fmtMoney } from "../utils/formatters";

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

// Renders connected institution cards with sync, refresh, and remove controls
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
    return fmtMoney(amount);
  }

  if (loading) {
    return (
      <div className="bank-connections-container">
        <h1>Bank Connections</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="bank-connections-container">
      <div className="bank-page-header">
        <div>
          <h1>Bank Connections</h1>
          <p className="bank-page-subtitle">
            Connect your Canadian bank accounts to automatically import transactions
          </p>
        </div>
        <div className="bank-header-actions">
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

      {plaidEnv === "sandbox" && (
        <div className="sandbox-notice">
          <strong>Sandbox Mode</strong> — Use Plaid test credentials (username: <code>user_good</code>, password: <code>pass_good</code>) to connect a simulated bank.
        </div>
      )}

      {!plaidConfigured && (
        <div className="plaid-error-notice">
          <strong>Plaid not configured.</strong> Add <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> to <code>server/.env</code> to enable bank connections.
        </div>
      )}

      {error && (
        <div className="error-notice">
          <span>{error}</span>
          <button className="error-notice-dismiss" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {successMsg && (
        <div className="success-notice">{successMsg}</div>
      )}

      {connections.length === 0 && (
        <div className="bank-empty-state">
          <div className="bank-empty-icon">🏦</div>
          <h3>No banks connected</h3>
          <p>Connect your bank to automatically import and categorize transactions.</p>
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={connecting || !plaidConfigured}
          >
            {connecting ? "Opening…" : "+ Connect Your First Bank"}
          </button>
        </div>
      )}

      <div className="conn-cards-list">
        {connections.map((conn) => (
          <div key={conn._id} className="conn-card">
            <div className="conn-card-header">
              <div>
                <div className="conn-card-title-row">
                  <h3>{conn.institutionName}</h3>
                  <span className={`conn-status-badge status-${conn.status}`}>
                    {conn.status}
                  </span>
                </div>
                <p className="conn-card-meta">
                  Connected {formatDate(conn.createdAt)} · {conn.transactionsSynced} transactions synced
                </p>
                <p className="conn-card-meta">
                  Last synced: {formatDate(conn.lastSyncedAt)}
                </p>
              </div>
              <div className="conn-card-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => handleSync(conn._id)}
                  disabled={syncingId === conn._id}
                >
                  {syncingId === conn._id ? "Syncing…" : "Sync"}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleRemove(conn._id, conn.institutionName)}
                  disabled={removingId === conn._id}
                >
                  {removingId === conn._id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>

            {conn.accounts.length > 0 && (
              <div className="conn-accounts-wrap">
                <table className="conn-accounts-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Type</th>
                      <th className="right">Current Balance</th>
                      <th className="right">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conn.accounts.map((acct) => (
                      <tr key={acct.plaidAccountId}>
                        <td>
                          {acct.officialName ?? acct.name}
                          {acct.mask && <span className="conn-acct-mask">••••{acct.mask}</span>}
                        </td>
                        <td className="conn-acct-subtype">{acct.subtype}</td>
                        <td className="right">{formatBalance(acct.currentBalance)}</td>
                        <td className="right conn-acct-avail">{formatBalance(acct.availableBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {conn.status === "error" && conn.errorCode && (
              <div className="conn-error-inline">
                Error: {conn.errorCode} — please reconnect this bank
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="how-it-works-card">
        <h4>How bank connections work</h4>
        <ul>
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

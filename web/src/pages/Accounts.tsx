// Accounts page: two-tab view for bank/everyday accounts and registered accounts (RRSP, TFSA, etc.)
import React, { useState, useEffect, useMemo } from 'react';
import './Accounts.css';
import { fmtMoney } from "../utils/formatters";
import { LIABILITY_TYPES } from "../utils/constants";

// ── Canadian institutions ────────────────────────────────────────────────────

const CANADIAN_BANKS = [
  { group: "Big Six Banks",      list: ["TD (TD Canada Trust)", "RBC (Royal Bank)", "BMO (Bank of Montreal)", "CIBC", "Scotiabank", "National Bank"] },
  { group: "Digital Banks",      list: ["Tangerine", "Simplii Financial", "EQ Bank", "PC Financial", "Neo Financial", "Wealthsimple Cash"] },
  { group: "Credit Unions",      list: ["Desjardins", "Meridian Credit Union", "Coast Capital Savings", "Alterna Savings", "First West Credit Union", "Servus Credit Union"] },
  { group: "Regional Banks",     list: ["ATB Financial", "Laurentian Bank", "Canadian Western Bank", "Manulife Bank"] },
  { group: "Other / Foreign",    list: ["American Express", "HSBC Canada", "Citibank Canada", "Other (specify)"] },
];

const ALL_INSTITUTIONS = CANADIAN_BANKS.flatMap(g => g.list);

// ── Everyday account types ───────────────────────────────────────────────────

type BankAccountType =
  | 'chequing' | 'savings' | 'credit-card'
  | 'line-of-credit' | 'mortgage' | 'auto-loan'
  | 'personal-loan' | 'student-loan' | 'investment' | 'other';

const BANK_ACCOUNT_TYPES: { value: BankAccountType; label: string; isLiability: boolean; icon: string }[] = [
  { value: 'chequing',      label: 'Chequing',             isLiability: false, icon: '🏦' },
  { value: 'savings',       label: 'Savings',              isLiability: false, icon: '💰' },
  { value: 'credit-card',   label: 'Credit Card',          isLiability: true,  icon: '💳' },
  { value: 'line-of-credit',label: 'Line of Credit',       isLiability: true,  icon: '🔄' },
  { value: 'mortgage',      label: 'Mortgage',             isLiability: true,  icon: '🏠' },
  { value: 'auto-loan',     label: 'Auto Loan',            isLiability: true,  icon: '🚗' },
  { value: 'personal-loan', label: 'Personal Loan',        isLiability: true,  icon: '📋' },
  { value: 'student-loan',  label: 'Student Loan',         isLiability: true,  icon: '🎓' },
  { value: 'investment',    label: 'Investment (Non-Reg)', isLiability: false, icon: '📈' },
  { value: 'other',         label: 'Other',                isLiability: false, icon: '🗂️' },
];

const TYPE_MAP = Object.fromEntries(BANK_ACCOUNT_TYPES.map(t => [t.value, t]));

// ── Interfaces ───────────────────────────────────────────────────────────────

interface BankAccount {
  _id: string;
  name: string;
  type: BankAccountType;
  institution?: string;
  balance: number;
  currency: string;
}

interface RegisteredAccount {
  _id: string;
  type: string;
  accountName: string;
  balance: number;
  currency: string;
}

interface AccountTypeInfo {
  type: string;
  description: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CAD = (n: number) => fmtMoney(Math.abs(n));


// ── Component ────────────────────────────────────────────────────────────────

// Manages bank and registered account CRUD with institution grouping and net-position summary
const Accounts: React.FC = () => {
  const [tab, setTab] = useState<'bank' | 'registered'>('bank');

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [debtTotal, setDebtTotal] = useState(0);
  const [bankLoading, setBankLoading] = useState(true);
  const [showBankForm, setShowBankForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [bankForm, setBankForm] = useState({
    institution: 'TD (TD Canada Trust)',
    institutionCustom: '',
    type: 'chequing' as BankAccountType,
    name: '',
    openingBalance: '0',
    currency: 'CAD',
  });

  // Registered accounts state (existing)
  const [accounts, setAccounts] = useState<RegisteredAccount[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountTypeInfo[]>([]);
  const [selectedType, setSelectedType] = useState<string>('RRSP');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [regForm, setRegForm] = useState({
    accountName: '',
    businessName: '',
    beneficiaryName: '',
    exchange: '',
    provinceOfIssuance: 'ON',
  });
  const [regLoading, setRegLoading] = useState(true);

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchBankAccounts = async () => {
    setBankLoading(true);
    try {
      const [acctRes, debtRes] = await Promise.all([
        fetch('/api/accounts', { credentials: 'include' }),
        fetch('/api/debts', { credentials: 'include' }),
      ]);
      const acctData = await acctRes.json();
      const debtData = await debtRes.json();
      setBankAccounts(Array.isArray(acctData) ? acctData : []);
      const debts: { currentBalance: number }[] = Array.isArray(debtData) ? debtData : [];
      setDebtTotal(debts.reduce((s, d) => s + d.currentBalance, 0));
    } catch (err) {
      console.error('Error fetching bank accounts:', err);
    } finally {
      setBankLoading(false);
    }
  };

  const fetchRegisteredAccounts = async () => {
    setRegLoading(true);
    try {
      const [accsRes, typesRes] = await Promise.all([
        fetch('/api/account-types/all', { credentials: 'include' }),
        fetch('/api/account-types/info/account-types', { credentials: 'include' }),
      ]);
      const accsData = await accsRes.json();
      const typesData = await typesRes.json();
      setAccounts(accsData.accounts || []);
      setAccountTypes(typesData);
    } catch (err) {
      console.error('Error fetching registered accounts:', err);
    } finally {
      setRegLoading(false);
    }
  };

  useEffect(() => {
    void fetchBankAccounts();
    void fetchRegisteredAccounts();
  }, []);

  // Close bank form and reset state when switching tabs
  useEffect(() => {
    setShowBankForm(false);
    setEditingAccount(null);
    setBankForm({
      institution: 'TD (TD Canada Trust)',
      institutionCustom: '',
      type: 'chequing',
      name: '',
      openingBalance: '0',
      currency: 'CAD',
    });
  }, [tab]);

  // Pre-fills account name from institution + type selection to reduce manual typing
  useEffect(() => {
    if (!editingAccount) {
      const inst = bankForm.institution === 'Other (specify)' ? bankForm.institutionCustom : bankForm.institution.split(' ')[0];
      const typLabel = TYPE_MAP[bankForm.type]?.label ?? '';
      setBankForm(f => ({ ...f, name: inst ? `${inst} ${typLabel}` : typLabel }));
    }
  }, [bankForm.institution, bankForm.type, bankForm.institutionCustom, editingAccount]);

  // ── Bank account CRUD ────────────────────────────────────────────────────────

  const handleCreateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const institution = bankForm.institution === 'Other (specify)'
      ? bankForm.institutionCustom
      : bankForm.institution;
    const opening = parseFloat(bankForm.openingBalance) || 0;

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: bankForm.name,
          type: bankForm.type,
          institution,
          balance: opening,
          currency: bankForm.currency,
        }),
      });

      if (!res.ok) { alert('Failed to create account'); return; }
      const created = await res.json();

      // Persist opening balance as an "Opening Balance" transaction so
      // the recalculation engine reflects it correctly.
      if (opening !== 0) {
        const isLiability = LIABILITY_TYPES.has(bankForm.type);
        await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            accountId: created._id,
            type: isLiability ? 'expense' : 'income',
            amount: Math.abs(opening),
            category: 'Other',
            description: 'Opening Balance',
            date: new Date().toISOString(),
          }),
        });
      }

      setShowBankForm(false);
      setBankForm({ institution: 'TD (TD Canada Trust)', institutionCustom: '', type: 'chequing', name: '', openingBalance: '0', currency: 'CAD' });
      await fetchBankAccounts();
    } catch (err) {
      console.error('Error creating account:', err);
    }
  };

  const handleUpdateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    const institution = bankForm.institution === 'Other (specify)'
      ? bankForm.institutionCustom
      : bankForm.institution;

    try {
      const res = await fetch(`/api/accounts/${editingAccount._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: bankForm.name,
          type: bankForm.type,
          institution,
          currency: bankForm.currency,
        }),
      });
      if (!res.ok) { alert('Failed to update account'); return; }
      setEditingAccount(null);
      setShowBankForm(false);
      await fetchBankAccounts();
    } catch (err) {
      console.error('Error updating account:', err);
    }
  };

  const handleDeleteBankAccount = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? All its transactions will lose their account link.`)) return;
    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE', credentials: 'include' });
      await fetchBankAccounts();
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  const startEditBankAccount = (acct: BankAccount) => {
    setEditingAccount(acct);
    const known = ALL_INSTITUTIONS.includes(acct.institution ?? '');
    setBankForm({
      institution: known ? (acct.institution ?? 'TD (TD Canada Trust)') : 'Other (specify)',
      institutionCustom: known ? '' : (acct.institution ?? ''),
      type: acct.type,
      name: acct.name,
      openingBalance: '0',
      currency: acct.currency,
    });
    setShowBankForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Registered account CRUD (existing logic) ─────────────────────────────────

  const handleCreateRegisteredAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    let endpoint = '/api/account-types';
    const payload: Record<string, unknown> = { accountName: regForm.accountName };

    switch (selectedType) {
      case 'RRSP': endpoint += '/rrsp/create'; break;
      case 'TFSA': endpoint += '/tfsa/create'; break;
      case 'FHSA': endpoint += '/fhsa/create'; break;
      case 'RESP':
        endpoint += '/resp/create';
        payload.beneficiaryName = regForm.beneficiaryName;
        payload.beneficiaryBirthDate = new Date().toISOString();
        payload.beneficiarySIN = '000-000-000';
        break;
      case 'LIF':
        endpoint += '/lif/create';
        payload.ownerAge = 55;
        payload.provinceOfIssuance = regForm.provinceOfIssuance;
        break;
      case 'RRIF':
        endpoint += '/rrif/create';
        payload.ownerAge = 55;
        break;
      case 'LIRA':
        endpoint += '/lira/create';
        payload.provinceOfIssuance = regForm.provinceOfIssuance;
        break;
      case 'RDSP':
        endpoint += '/rdsp/create';
        payload.beneficiaryName = regForm.beneficiaryName;
        payload.beneficiaryBirthDate = new Date().toISOString();
        payload.beneficiarySIN = '000-000-000';
        payload.designatedResponsible = regForm.beneficiaryName;
        break;
      case 'NON_REGISTERED': endpoint += '/non-registered/create'; break;
      case 'CRYPTO':
        endpoint += '/crypto/create';
        payload.exchange = regForm.exchange;
        break;
      case 'CORPORATE':
        endpoint += '/corporate/create';
        payload.businessName = regForm.businessName;
        payload.businessType = 'sole-proprietor';
        payload.fiscalYearEnd = '12-31';
        break;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setRegForm({ accountName: '', businessName: '', beneficiaryName: '', exchange: '', provinceOfIssuance: 'ON' });
        setShowCreateForm(false);
        void fetchRegisteredAccounts();
      }
    } catch (err) {
      console.error('Error creating registered account:', err);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Groups accounts by institution for the banded card display; alphabetically sorted
  const accountsByInstitution = useMemo(() => {
    const map = new Map<string, BankAccount[]>();
    for (const acct of bankAccounts) {
      const key = acct.institution || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(acct);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [bankAccounts]);

  // Includes Debt model entries in liabilities so the net position matches the Debts page
  const bankTotals = useMemo(() => {
    let assets = 0, liabilities = 0;
    for (const acct of bankAccounts) {
      if (LIABILITY_TYPES.has(acct.type)) liabilities += acct.balance;
      else assets += acct.balance;
    }
    // Also include Debt model entries (mortgages, loans added via Debts page)
    liabilities += debtTotal;
    return { assets, liabilities, net: assets - liabilities };
  }, [bankAccounts, debtTotal]);

  const filteredRegistered = accounts.filter(a => a.type === selectedType);
  const selectedTypeInfo = accountTypes.find(t => t.type === selectedType);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="accounts-container">
      <h1>Accounts</h1>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border, #e5e7eb)' }}>
        {([['bank', '🏦 Bank & Everyday'], ['registered', '📋 Registered (RRSP / TFSA…)']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 18px', border: 'none', cursor: 'pointer', fontWeight: tab === key ? 700 : 400,
              background: 'transparent', fontSize: '0.88rem',
              borderBottom: tab === key ? '2px solid #4f46e5' : '2px solid transparent',
              color: tab === key ? '#4f46e5' : 'var(--text-light, #6b7280)',
              marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Bank & Everyday Accounts ─────────────────────────────────── */}
      {tab === 'bank' && (
        <div>
          {/* Summary bar */}
          {bankAccounts.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Assets', value: CAD(bankTotals.assets), color: '#059669' },
                { label: 'Total Liabilities', value: CAD(bankTotals.liabilities), color: '#dc2626' },
                { label: 'Net Position', value: CAD(bankTotals.net), color: bankTotals.net >= 0 ? '#2563eb' : '#dc2626' },
                { label: 'Accounts', value: String(bankAccounts.length), color: 'var(--text)' },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '8px 14px', minWidth: 130 }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-light, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Add / Edit form */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              className="btn-primary"
              onClick={() => {
                if (showBankForm && editingAccount) { setEditingAccount(null); }
                setShowBankForm(s => !s);
              }}
            >
              {showBankForm ? 'Cancel' : '+ Add Account'}
            </button>
          </div>

          {showBankForm && (
            <form
              className="create-form"
              onSubmit={editingAccount ? handleUpdateBankAccount : handleCreateBankAccount}
              style={{ marginBottom: 20 }}
            >
              <h3 style={{ marginTop: 0 }}>{editingAccount ? `Edit — ${editingAccount.name}` : 'Add Bank / Everyday Account'}</h3>
              <div className="form-grid">

                {/* Institution */}
                <div className="form-group">
                  <label>Institution</label>
                  <select value={bankForm.institution} onChange={e => setBankForm(f => ({ ...f, institution: e.target.value }))}>
                    {CANADIAN_BANKS.map(grp => (
                      <optgroup key={grp.group} label={grp.group}>
                        {grp.list.map(inst => <option key={inst} value={inst}>{inst}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {bankForm.institution === 'Other (specify)' && (
                  <div className="form-group">
                    <label>Institution Name</label>
                    <input
                      type="text"
                      placeholder="e.g., My Credit Union"
                      value={bankForm.institutionCustom}
                      onChange={e => setBankForm(f => ({ ...f, institutionCustom: e.target.value }))}
                      required
                    />
                  </div>
                )}

                {/* Account type */}
                <div className="form-group">
                  <label>Account Type</label>
                  <select value={bankForm.type} onChange={e => setBankForm(f => ({ ...f, type: e.target.value as BankAccountType }))}>
                    {BANK_ACCOUNT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Account name */}
                <div className="form-group">
                  <label>Account Name</label>
                  <input
                    type="text"
                    value={bankForm.name}
                    onChange={e => setBankForm(f => ({ ...f, name: e.target.value }))}
                    required
                    placeholder="e.g., TD Everyday Chequing"
                  />
                </div>

                {/* Opening balance (create only) */}
                {!editingAccount && (
                  <div className="form-group">
                    <label>
                      Opening Balance (CAD)
                      {LIABILITY_TYPES.has(bankForm.type) && (
                        <span style={{ fontWeight: 400, color: 'var(--text-light, #6b7280)', marginLeft: 6 }}>— enter current amount owed</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bankForm.openingBalance}
                      onChange={e => setBankForm(f => ({ ...f, openingBalance: e.target.value }))}
                    />
                  </div>
                )}

                {/* Currency */}
                <div className="form-group">
                  <label>Currency</label>
                  <select value={bankForm.currency} onChange={e => setBankForm(f => ({ ...f, currency: e.target.value }))}>
                    <option value="CAD">CAD — Canadian Dollar</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary">
                {editingAccount ? 'Save Changes' : 'Create Account'}
              </button>
            </form>
          )}

          {/* Accounts grouped by institution */}
          {bankLoading ? (
            <p>Loading accounts…</p>
          ) : bankAccounts.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>No bank accounts yet.</p>
              <p style={{ color: 'var(--text-light, #6b7280)' }}>
                Click <strong>+ Add Account</strong> to add your chequing, savings, credit card, or loan accounts.
              </p>
            </div>
          ) : (
            <div>
              {accountsByInstitution.map(([institution, accts]) => (
                <div key={institution} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-light, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    {institution}
                  </h3>
                  <div className="account-cards">
                    {accts.map(acct => {
                      const meta = TYPE_MAP[acct.type] ?? { icon: '🗂️', label: acct.type, isLiability: false };
                      const isLiability = meta.isLiability;
                      return (
                        <div key={acct._id} className="account-card" style={{ position: 'relative' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{meta.icon}</span>
                            <div style={{ display: 'flex', gap: 3 }}>
                              <button
                                onClick={() => startEditBankAccount(acct)}
                                style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border, #e5e7eb)', background: 'transparent', cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteBankAccount(acct._id, acct.name)}
                                style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, border: 'none', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                              >
                                Del
                              </button>
                            </div>
                          </div>
                          <h4 style={{ margin: '0 0 3px' }}>{acct.name}</h4>
                          <span className="type-badge">{meta.label}</span>
                          <p className="balance" style={{ color: isLiability ? '#dc2626' : '#059669', marginTop: 6 }}>
                            {isLiability ? '−' : ''}{CAD(acct.balance)}
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-light, #6b7280)', marginLeft: 3 }}>{acct.currency}</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Registered Accounts (existing) ───────────────────────────── */}
      {tab === 'registered' && (
        <div className="accounts-layout">
          <aside className="accounts-sidebar">
            <h3>Account Types</h3>
            <nav className="account-type-nav">
              {accountTypes.map(type => (
                <button
                  key={type.type}
                  className={`account-type-btn ${selectedType === type.type ? 'active' : ''}`}
                  onClick={() => setSelectedType(type.type)}
                >
                  <span className="type-name">{type.type.replace(/_/g, ' ')}</span>
                  <span className="type-count">{accounts.filter(a => a.type === type.type).length}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="accounts-main">
            <div className="account-header">
              <div>
                <h2>{selectedType.replace(/_/g, ' ')}</h2>
                {selectedTypeInfo && <p className="description">{selectedTypeInfo.description}</p>}
              </div>
              <button className="btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
                {showCreateForm ? 'Cancel' : '+ New Account'}
              </button>
            </div>

            {showCreateForm && (
              <form className="create-form" onSubmit={handleCreateRegisteredAccount}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Account Name</label>
                    <input type="text" value={regForm.accountName} onChange={e => setRegForm({ ...regForm, accountName: e.target.value })} required />
                  </div>
                  {selectedType === 'RESP' && (
                    <div className="form-group">
                      <label>Beneficiary Name</label>
                      <input type="text" value={regForm.beneficiaryName} onChange={e => setRegForm({ ...regForm, beneficiaryName: e.target.value })} required />
                    </div>
                  )}
                  {selectedType === 'RDSP' && (
                    <div className="form-group">
                      <label>Beneficiary Name (Disabled Person)</label>
                      <input type="text" value={regForm.beneficiaryName} onChange={e => setRegForm({ ...regForm, beneficiaryName: e.target.value })} required placeholder="Name of person with disability" />
                    </div>
                  )}
                  {selectedType === 'CORPORATE' && (
                    <div className="form-group">
                      <label>Business Name</label>
                      <input type="text" value={regForm.businessName} onChange={e => setRegForm({ ...regForm, businessName: e.target.value })} required />
                    </div>
                  )}
                  {selectedType === 'CRYPTO' && (
                    <div className="form-group">
                      <label>Exchange</label>
                      <input type="text" placeholder="e.g., Kraken, Newton, Bitbuy" value={regForm.exchange} onChange={e => setRegForm({ ...regForm, exchange: e.target.value })} />
                    </div>
                  )}
                  {(selectedType === 'LIF' || selectedType === 'LIRA') && (
                    <div className="form-group">
                      <label>Province of Issuance</label>
                      <select value={regForm.provinceOfIssuance} onChange={e => setRegForm({ ...regForm, provinceOfIssuance: e.target.value })}>
                        {[['BC','British Columbia'],['AB','Alberta'],['SK','Saskatchewan'],['MB','Manitoba'],['ON','Ontario'],['QC','Quebec'],['NB','New Brunswick'],['NS','Nova Scotia'],['PE','Prince Edward Island'],['NL','Newfoundland and Labrador']].map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <button type="submit" className="btn-primary">Create Account</button>
              </form>
            )}

            <div className="accounts-list">
              <h3>Your {selectedType.replace(/_/g, ' ')} Accounts</h3>
              {regLoading ? (
                <p>Loading…</p>
              ) : filteredRegistered.length === 0 ? (
                <p className="empty-state">No {selectedType.replace(/_/g, ' ')} accounts yet. Create one to get started.</p>
              ) : (
                <div className="account-cards">
                  {filteredRegistered.map(account => (
                    <div key={account._id} className="account-card">
                      <h4>{account.accountName}</h4>
                      <p className="balance">{CAD(account.balance)} {account.currency}</p>
                      <p className="type-badge">{account.type}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="account-stats">
              <div className="stat-box"><h4>Total Accounts</h4><p className="stat-value">{accounts.length}</p></div>
              <div className="stat-box"><h4>Total Balance</h4><p className="stat-value">{CAD(accounts.reduce((s, a) => s + a.balance, 0))}</p></div>
              <div className="stat-box"><h4>This Type</h4><p className="stat-value">{filteredRegistered.length}</p></div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
};

export default Accounts;

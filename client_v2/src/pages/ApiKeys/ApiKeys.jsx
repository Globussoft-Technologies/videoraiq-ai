import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, unwrap, getApiErrorMessage } from '@/helpers/client';
import './ApiKeys.css';

const PAGE_SIZE = 20;
const dateLabel = value => value ? new Date(value).toLocaleString() : '-';
const statusOf = key => key.revokedAt ? 'Revoked' : new Date(key.expiresAt) <= new Date() ? 'Expired' : 'Active';

export default function ApiKeys() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.adminId && !user.memberId && !user.system && !user.registrationLinkId && user.tokenType !== 'raspberry-pi');
  const accountId = isAdmin ? String(user.adminId) : '';
  const [options, setOptions] = useState([]);
  const [keys, setKeys] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('30');
  const [unit, setUnit] = useState('days');
  const [access, setAccess] = useState('read');
  const [allScopes, setAllScopes] = useState(true);
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState('');
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const generation = useRef(0);
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const pending = useRef(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const [choices, list] = await Promise.all([
        api.get('/api-keys/options'),
        api.get('/api-keys', { params: { skip: page * PAGE_SIZE, limit: PAGE_SIZE } }),
      ]);
      if (generation.current !== request) return;
      setOptions(unwrap(choices).scopes);
      const result = unwrap(list);
      setKeys(result.keys); setTotal(result.total);
    } catch (err) {
      if (generation.current === request) setError(getApiErrorMessage(err, 'Unable to load API keys'));
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [accountId, page]);

  useEffect(() => { load(); return () => { generation.current += 1; }; }, [load]);
  useEffect(() => {
    currentAccount.current = accountId;
    setSecret(''); setRevokeTarget(null); setPage(0); setKeys([]); setTotal(0);
    setName(''); setSelected([]); setAllScopes(true);
    return () => { currentAccount.current = ''; };
  }, [accountId]);

  const validDuration = Number.isSafeInteger(Number(duration)) && Number(duration) > 0;
  const canCreate = name.trim() && validDuration && (allScopes || selected.length) && options.length && !loading && !error && !creating && !secret;
  async function create(event) {
    event.preventDefault();
    if (!canCreate || pending.current) return;
    pending.current = true; setCreating(true);
    const owner = accountId;
    try {
      const result = unwrap(await api.post('/api-keys', { name: name.trim(), duration: Number(duration), unit, access, scopes: allScopes ? ['*'] : selected }));
      if (currentAccount.current !== owner) return;
      setSecret(result.secret); setName('');
      toast.success('API key created. Copy it before dismissing.');
      if (page) setPage(0); else await load();
    } catch (err) {
      if (currentAccount.current === owner) toast.error(getApiErrorMessage(err, 'Unable to create API key'));
    } finally { pending.current = false; setCreating(false); }
  }
  async function revoke() {
    if (!revokeTarget || pending.current) return;
    pending.current = true; setRevoking(true);
    const owner = accountId;
    try {
      await api.delete(`/api-keys/${revokeTarget._id}`);
      if (currentAccount.current !== owner) return;
      setRevokeTarget(null); toast.success('API key revoked'); await load();
    } catch (err) {
      if (currentAccount.current === owner) toast.error(getApiErrorMessage(err, 'Unable to revoke API key'));
    } finally { pending.current = false; setRevoking(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(secret); toast.success('API key copied'); }
    catch { toast.error('Unable to copy. Select and copy the key below.'); }
  }

  if (!user) return <div className="api-keys-page api-keys-state" role="status"><LoaderCircle className="api-keys-spin" /> Loading account...</div>;
  if (!isAdmin) return <div className="api-keys-page api-keys-state" role="alert">An admin login is required to manage API keys.</div>;
  const exampleUrl = `${String(import.meta.env.VITE_BACKEND || '/api/v2').replace(/\/$/, '')}/incidents/solder-line`;

  return <main className="api-keys-page">
    <div className="api-keys-heading"><KeyRound size={24} /><div><h1>Integration API keys</h1><p>Connect other software to your admin account.</p></div></div>
    {secret && <section className="api-keys-secret" aria-label="New API key">
      <div className="api-keys-secret-heading"><strong>Copy your new key now</strong><button type="button" className="api-keys-button" onClick={() => setSecret('')} aria-label="Dismiss API key"><X size={16} /></button></div>
      <p>This secret is shown once. Save it in your integration's secure server configuration.</p>
      <div className="api-keys-copy"><code tabIndex={0}>{secret}</code><button type="button" className="api-keys-button" onClick={copy}><Copy size={16} /> Copy</button></div>
    </section>}
    <section className="api-keys-card">
      <h2>Create API key</h2>
      <form onSubmit={create}>
        <div className="api-keys-fields">
          <label>Integration name<input value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="e.g. ERP integration" /></label>
          <label>Valid for<input type="number" min="1" step="1" required value={duration} onChange={event => setDuration(event.target.value)} /></label>
          <label>Duration unit<select value={unit} onChange={event => setUnit(event.target.value)}><option value="days">Days</option><option value="years">Years</option></select></label>
          <label>Access<select value={access} onChange={event => setAccess(event.target.value)}><option value="read">Read only</option><option value="full">Full access</option></select></label>
        </div>
        <p className="api-keys-hint">{access === 'read' ? 'Read data using GET and supported POST query endpoints.' : 'Read, create, update and delete data in the selected APIs.'} Keys use your account's current subscription. Login and API-key management require your admin session.</p>
        <fieldset><legend>API permissions</legend><label className="api-keys-checkbox"><input type="checkbox" checked={allScopes} onChange={event => setAllScopes(event.target.checked)} /> All available admin APIs</label>
          {!allScopes && <div className="api-keys-scopes">{options.map(scope => <label className="api-keys-checkbox" key={scope.id}><input type="checkbox" checked={selected.includes(scope.id)} onChange={event => setSelected(values => event.target.checked ? [...values, scope.id] : values.filter(value => value !== scope.id))} />{scope.label}</label>)}</div>}
        </fieldset>
        <button type="submit" className="api-keys-button api-keys-primary" disabled={!canCreate || revoking}>{creating ? <LoaderCircle className="api-keys-spin" size={16} /> : <KeyRound size={16} />} {creating ? 'Generating...' : 'Generate key'}</button>
      </form>
    </section>
    <section className="api-keys-card">
      <div className="api-keys-list-heading"><h2>Your API keys</h2><button type="button" className="api-keys-button" onClick={load} disabled={loading} aria-label="Refresh API keys"><RefreshCw size={16} /></button></div>
      {loading ? <div className="api-keys-state" role="status"><LoaderCircle className="api-keys-spin" /> Loading API keys...</div> : error ? <div className="api-keys-state" role="alert">{error}<button type="button" className="api-keys-button" onClick={load}>Retry</button></div> : !keys.length ? <div className="api-keys-state">No API keys created yet.</div> : <>
        <div className="api-keys-table-wrap"><table><thead><tr><th>Name / key</th><th>Access</th><th>APIs</th><th>Status</th><th>Expires</th><th>Last used</th><th>Requests</th><th>Action</th></tr></thead><tbody>{keys.map(key => {
          const status = statusOf(key);
          return <tr key={key._id}><td><strong>{key.name}</strong><code>{key.prefix}...</code></td><td>{key.access === 'full' ? 'Full access' : 'Read only'}</td><td>{key.scopes.includes('*') ? 'All available' : key.scopes.map(id => options.find(scope => scope.id === id)?.label || id).join(', ')}</td><td><span className={`api-keys-status api-keys-${status.toLowerCase()}`}>{status}</span></td><td>{dateLabel(key.expiresAt)}</td><td>{dateLabel(key.lastUsedAt)}</td><td>{key.requestCount || 0}</td><td>{status === 'Active' ? <button type="button" className="api-keys-button api-keys-danger" onClick={() => setRevokeTarget(key)} disabled={revoking || creating}>Revoke</button> : '-'}</td></tr>;
        })}</tbody></table></div>
        <div className="api-keys-pagination"><span>{page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span><button type="button" className="api-keys-button" disabled={!page} onClick={() => setPage(value => value - 1)}>Previous</button><button type="button" className="api-keys-button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </>}
    </section>
    <section className="api-keys-card"><h2><ShieldCheck size={18} /> Use your API key</h2><p>Send the key in the <code>x-api-key</code> header from your integration server. API paths and request bodies stay the same.</p><pre>{`fetch('${exampleUrl}', {\n  headers: { 'x-api-key': 'YOUR_API_KEY' }\n});`}</pre><p className="api-keys-hint">To rotate a key, create a replacement, update your integration, then revoke the old key.</p></section>
    <Dialog.Root open={Boolean(revokeTarget)} onOpenChange={open => { if (!open && !revoking) setRevokeTarget(null); }}><Dialog.Portal><Dialog.Overlay className="api-keys-overlay" /><Dialog.Content className="api-keys-dialog" onEscapeKeyDown={event => { if (revoking) event.preventDefault(); }} onPointerDownOutside={event => { if (revoking) event.preventDefault(); }}><Dialog.Title>Revoke API key?</Dialog.Title><Dialog.Description>Connections using “{revokeTarget?.name}” will lose access immediately. This cannot be undone.</Dialog.Description><div className="api-keys-dialog-actions"><button type="button" className="api-keys-button" onClick={() => setRevokeTarget(null)} disabled={revoking}>Cancel</button><button type="button" className="api-keys-button api-keys-danger" onClick={revoke} disabled={revoking}>{revoking ? 'Revoking...' : 'Revoke key'}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </main>;
}

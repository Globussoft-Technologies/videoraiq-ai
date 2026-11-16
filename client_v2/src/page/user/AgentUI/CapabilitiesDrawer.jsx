import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, LockKeyhole, RotateCw, ShieldCheck, X } from 'lucide-react';
import { agentApi } from './agentApi';

const readable = (value) => String(value || '').replaceAll('_', ' ');
export default function CapabilitiesDrawer({ onClose, theme = 'light' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    setLoading(true); setError('');
    agentApi.capabilities(controller.signal).then((result) => {
      if (!live) return;
      const payload = result?.body?.data || result?.body || result?.data || result;
      if (!Array.isArray(payload?.capabilities)) throw new Error('Invalid capabilities response');
      setData(payload);
    }).catch(() => { if (live) setError('Could not load capabilities. Check your connection and try again.'); })
      .finally(() => { window.clearTimeout(timer); if (live) setLoading(false); });
    return () => { live = false; window.clearTimeout(timer); controller.abort(); };
  }, [retryKey]);
  const all = Array.isArray(data?.capabilities) ? data.capabilities : [];
  const ready = (item) => ['verified', 'simulated'].includes(item.status);
  const list = useMemo(() => all.filter((item) => (filter === 'All' || (filter === 'Ready' ? ready(item) : !ready(item))) && `${item.capability} ${item.method} ${item.path}`.toLowerCase().includes(query.toLowerCase())), [all, filter, query]);
  return <div className="agent-capability-backdrop" data-agent-theme={theme}><section className="agent-capability-drawer" role="region" aria-label="Capabilities"><header><div><h2>Capabilities</h2><p>Read access and change availability</p></div><button type="button" onClick={onClose} aria-label="Close capabilities"><X size={18} /></button></header><p className="agent-capability-description">Backend reads the agent may use for your account. Only verified capabilities are offered to the AI model; the rest stay locked until the backend is verified.</p>{loading && <div className="agent-capability-state" role="status"><span className="agent-capability-spinner" />Loading capabilities…</div>}{error && !loading && <div className="agent-capability-error" role="alert"><span className="agent-capability-error-icon"><AlertCircle size={22} /></span><h3>Capabilities are unavailable</h3><p>{error}</p><button type="button" onClick={() => setRetryKey((key) => key + 1)}><RotateCw size={15} />Try again</button></div>}{data && <><div className="agent-capability-stats"><div className="ready"><span className="agent-capability-stat-icon"><CheckCircle2 size={17} /></span><strong>{all.filter(ready).length}</strong><small>Ready</small></div><div className="locked"><span className="agent-capability-stat-icon"><LockKeyhole size={17} /></span><strong>{all.filter((item) => item.status === 'documented_unverified').length}</strong><small>Locked</small></div><div className={`changes ${data.backend_writes_enabled ? 'enabled' : 'disabled'}`}><span className="agent-capability-stat-icon"><ShieldCheck size={17} /></span><strong>{data.backend_writes_enabled ? 'Allowed' : 'Off'}</strong><small>Changes</small></div></div><label className="agent-capability-search"><span>Search capabilities</span><input type="search" placeholder="Search by name or endpoint" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="agent-capability-tabs" role="tablist" aria-label="Capability status">{['All', 'Ready', 'Locked'].map((tab) => <button type="button" role="tab" aria-selected={filter === tab} key={tab} onClick={() => setFilter(tab)}>{tab}<span>{tab === 'All' ? all.length : tab === 'Ready' ? all.filter(ready).length : all.filter((item) => !ready(item)).length}</span></button>)}</div><div className="agent-capability-list">{list.map((item) => <article className={ready(item) ? 'ready' : 'locked'} key={item.capability}><div className="agent-capability-row-head"><strong>{readable(item.capability)}</strong><span className={`agent-capability-status ${ready(item) ? 'ready' : item.status === 'documented_unverified' ? 'locked' : 'other'}`}>{ready(item) ? '✓ ' : '○ '}{item.status === 'documented_unverified' ? 'Locked' : readable(item.status)}</span></div><code>{item.method} {item.path}</code><small>Coverage: {readable(item.data_coverage)}{item.collection_start ? ` · Since ${item.collection_start}` : ''}</small></article>)}</div>{!list.length && <p className="agent-capability-empty">No matching capabilities.</p>}</>}</section></div>;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAgentConversations } from './useAgentConversations';
import { useTheme } from '@/theme/ThemeContext';
import { useApi } from '@/hooks/useApi';
import { getCriticalityStats } from '@/helpers/dashboard';
import { timings } from './data';
import ChatHistorySidebar from './ChatHistorySidebar';
import Header from './Header';
import Hero from './Hero';
import LiveStats from './LiveStats';
import ChatLog from './ChatLog';
import ChatInput from './ChatInput';
import Toasts from './Toasts';
import { agentApi } from './agentApi';
import { useAgentDashboardMetrics } from './useAgentDashboardMetrics';
import './AgentUI.css';

const MODE_KEY = 'videora_agent_sidebar_mode';
const NARROW_PX = 820;
const seenToastAlerts = new Set();
const readMode = () => { try { const saved = localStorage.getItem(MODE_KEY); return ['collapsed', 'compact', 'full'].includes(saved) ? saved : 'full'; } catch { return 'full'; } };
const isTodayAlert = (alert, today) => {
  const incidentTime = new Date(alert?.timeOfIncident);
  return Number.isFinite(incidentTime.getTime()) &&
    incidentTime.getTime() <= Date.now() &&
    incidentTime.toLocaleDateString('en-CA') === today;
};

export default function AgentUI({ mode = 'full', onClose, onExpand, panelPosition, onPanelPointerDown }) {
  const navigate = useNavigate();
  const location = useLocation();
  const compact = mode === 'compact';
  const { conversations, activeId, messages, sending, historyLoading, historyError: historyApiError, threadLoading, threadError, newChat, selectChat, deleteChat, renameChat, send } = useAgentConversations();
  const { cameras, detections, incidents, cameraBars, detectionBars, analyticsReady } = useAgentDashboardMetrics();
  const { theme } = useTheme();
  const rootRef = useRef(null);
  const [panelWidth, setPanelWidth] = useState(() => typeof window === 'undefined' ? 9999 : window.innerWidth);
  const isNarrow = panelWidth < NARROW_PX;
  const [sidebarMode, setSidebarMode] = useState(readMode);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [composerVersion, setComposerVersion] = useState(0);
  const [showAnalyticsStatus, setShowAnalyticsStatus] = useState(false);
  const [activeCard, setActiveCard] = useState(-1);
  const [toasts, setToasts] = useState([]);
  const seenAlerts = useRef(seenToastAlerts);
  const toastTimers = useRef(new Set());
  const showInputToast = (message) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-1), { id, text: message, type: 'error' }]);
    const remove = window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), timings.toastVisible + timings.toastExit);
    toastTimers.current.add(remove);
  };
  const today = new Date().toLocaleDateString('en-CA');
  const { data: alertFeed } = useApi(() => getCriticalityStats({ startDate: today, endDate: today }, { skip: 0, limit: 8 }), [today], { pollMs: 30000, pollSilent: true, cacheKey: `agent-today-alerts-${today}` });

  const changeMode = (mode) => { setSidebarMode(mode); try { localStorage.setItem(MODE_KEY, mode); } catch { /* The layout still works without storage. */ } };
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleSidebar = () => { if (isNarrow) setMobileOpen((open) => !open); else changeMode(sidebarMode === 'collapsed' ? 'full' : 'collapsed'); };
  const startNew = async () => { try { await newChat(); setComposerVersion((version) => version + 1); setHistoryError(''); } catch { setHistoryError('Could not create a conversation. Try again.'); } };
  const confirmDelete = async () => { if (!deleteTarget) return; setDeleting(true); try { await deleteChat(deleteTarget.id); setDeleteTarget(null); setHistoryError(''); } catch (error) { setHistoryError(error?.response?.data?.body?.message || 'Could not delete the conversation. Try again.'); } finally { setDeleting(false); } };
  const rename = async (id, title) => { try { await renameChat(id, title); setHistoryError(''); } catch (error) { setHistoryError(error?.response?.data?.body?.message || 'Could not rename the conversation. Try again.'); throw error; } };
  const ask = (question, options) => send(question, options);
  const closeAgent = () => { if (onClose) onClose(); else navigate(location.state?.agentReturnTo || '/dashboard', { state: { agentOpenCompact: false } }); };
  const toggleExpand = () => {
    if (compact) { onExpand?.(); return; }
    navigate(location.state?.agentReturnTo || '/dashboard', { state: { agentOpenCompact: true } });
  };

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    const updateWidth = () => setPanelWidth(element.getBoundingClientRect().width);
    updateWidth();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', updateWidth); return () => window.removeEventListener('resize', updateWidth); }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (!isNarrow) setMobileOpen(false); }, [isNarrow]);

  useEffect(() => { const onKey = (event) => { if (event.key === 'Escape' && deleteTarget && !deleting) setDeleteTarget(null); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [deleteTarget, deleting]);

  useEffect(() => { if (!analyticsReady) return undefined; const id = window.setInterval(() => setShowAnalyticsStatus((current) => !current), timings.ticker); return () => window.clearInterval(id); }, [analyticsReady]);
  useEffect(() => { const id = window.setInterval(() => setActiveCard((current) => (current + 1) % 4), timings.card); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    const alerts = alertFeed?.recentAlerts?.filter((alert) => isTodayAlert(alert, today));
    if (!Array.isArray(alerts) || alerts.length === 0) return;
    const fresh = alerts.filter((alert) => alert._id && !seenAlerts.current.has(alert._id));
    alerts.forEach((alert) => { if (alert._id) seenAlerts.current.add(alert._id); });
    if (!fresh.length) return;
    const latest = fresh[0];
    const title = latest.incidentName || latest.displayName || latest.incidentType || 'Detection event';
    const camera = latest.channelData?.name || latest.nvrData?.nvrName;
    const item = { id: latest._id, text: camera ? `${title} · ${camera}` : title };
    setToasts((current) => [...current.slice(-1), item]);
    const exit = window.setTimeout(() => setToasts((current) => current.map((toast) => toast.id === item.id ? { ...toast, exiting: true } : toast)), timings.toastVisible);
    const remove = window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== item.id)), timings.toastVisible + timings.toastExit);
    toastTimers.current.add(exit);
    toastTimers.current.add(remove);
  }, [alertFeed, today]);
  useEffect(() => () => { toastTimers.current.forEach(window.clearTimeout); }, []);

  return <div ref={rootRef} className={`agent-ui agent-workspace ${messages.length ? 'agent-has-thread' : ''} ${compact ? 'agent-compact' : ''} ${isNarrow ? 'agent-narrow' : ''}`} data-agent-theme={theme} style={compact ? panelPosition : undefined}>
    <div className="agent-glow agent-g1" /><div className="agent-glow agent-g2" />
    <svg className="agent-watermark" viewBox="0 0 100 100" aria-hidden="true"><path d="M10 15 50 85 90 15" fill="none" stroke="#6a2fe0" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" /></svg>
    {!compact && <ChatHistorySidebar mode={sidebarMode} mobileOpen={mobileOpen} isNarrow={isNarrow} onModeChange={changeMode} onToggle={toggleSidebar} onMobileClose={closeMobile} conversations={conversations} activeId={activeId} onSelect={selectChat} onNew={startNew} onRename={rename} onDelete={setDeleteTarget} loading={historyLoading} error={historyError || historyApiError} getConversation={agentApi.get} />}
    <main className="agent-main">
      <div className="agent-main-content">
        <div className="agent-page-header"><Header compact={compact} sidebarCollapsed={sidebarMode === 'collapsed' && !isNarrow && !mobileOpen} onToggleSidebar={toggleSidebar} onToggleExpand={toggleExpand} onNew={startNew} onClose={closeAgent} onPanelPointerDown={onPanelPointerDown} /></div>
        <div className="agent-app">{threadLoading ? <div className="agent-thread-state" role="status">Loading conversation…</div> : messages.length ? <ChatLog messages={messages} sending={sending} /> : <div className="agent-home-content">{threadError && <p className="agent-input-error" role="alert">{threadError}</p>}<Hero ticker={analyticsReady && showAnalyticsStatus ? 'Analytics report refreshed' : cameras === null ? 'Checking camera status…' : `Monitoring ${cameras} cameras live`} activeCard={activeCard} onAsk={ask} /><LiveStats cameras={cameras} detections={detections} incidents={incidents} cameraBars={cameraBars} detectionBars={detectionBars} /></div>}<ChatInput key={`${activeId || 'new'}-${composerVersion}`} onSend={ask} sending={sending} conversationId={activeId} onToast={showInputToast} /></div>
      </div>
    </main>
    <Toasts items={toasts} />
    {deleteTarget && <div className="agent-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}><div className="agent-confirm" role="alertdialog" aria-modal="true" aria-labelledby="agent-delete-title" aria-describedby="agent-delete-desc"><button className="agent-confirm-close" type="button" aria-label="Cancel delete" onClick={() => setDeleteTarget(null)}><X size={17} /></button><h2 id="agent-delete-title">Delete conversation?</h2><p id="agent-delete-desc">“{deleteTarget.title}” and its messages will be permanently removed.</p><div><button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button><button type="button" onClick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button></div></div></div>}
  </div>;
}

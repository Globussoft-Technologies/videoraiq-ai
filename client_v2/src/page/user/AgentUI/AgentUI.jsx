import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CircleAlert, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAgentConversations } from './useAgentConversations';
import { useTheme } from '@/theme/ThemeContext';
import { useApi } from '@/hooks/useApi';
import { getNvrs } from '@/helpers/configure';
import { getRoles } from '@/helpers/administer';
import { getDepartments, getLocations } from '@/helpers/monitoring';
import { timings } from './data';
import ChatHistorySidebar from './ChatHistorySidebar';
import Header from './Header';
import Hero from './Hero';
import LiveStats from './LiveStats';
import ChatLog from './ChatLog';
import ApprovalDialog from './ApprovalDialog';
import ChatInput, { clearNewChatDraft } from './ChatInput';
import Toasts from './Toasts';
import { agentApi } from './agentApi';
import { useAgentDashboardMetrics } from './useAgentDashboardMetrics';
import CapabilitiesDrawer from './CapabilitiesDrawer';
import './AgentUI.css';

const MODE_KEY = 'videora_agent_sidebar_mode';
const NARROW_PX = 820;
const readMode = () => { try { const saved = localStorage.getItem(MODE_KEY); return ['collapsed', 'compact', 'full'].includes(saved) ? saved : 'full'; } catch { return 'full'; } };

export default function AgentUI(props) {
  return <LiveAgentUI {...props} />;
}

function LiveAgentUI({ mode = 'full', onClose, onExpand, panelPosition, onPanelPointerDown }) {
  const navigate = useNavigate();
  const location = useLocation();
  const compact = mode === 'compact';
  const { conversations, activeId, messages, sending, lockReason, uncertain, retryUncertain, discardUncertain, historyLoading, historyError: historyApiError, threadLoading, threadError, newChat, selectChat, deleteChat, renameChat, send, approval, hasPendingApproval, decisionError, dismissApproval, reopenApproval, decide, recover, stop } = useAgentConversations();
  const { channels, cameras, detections, incidents, cameraBars, detectionBars, analyticsReady } = useAgentDashboardMetrics();
  const needsDeviceNames = hasPendingApproval || messages.some((message) => message.role === 'assistant' && /\b[0-9a-f]{24}\b/i.test(message.text));
  const { data: nvrInventory } = useApi(() => getNvrs(0, 500), [], { enabled: needsDeviceNames });
  const needsAdminNames = Boolean(approval?.proposals?.some((proposal) => proposal.kind === 'admin'));
  const { data: adminNames } = useApi(async () => {
    const results = await Promise.allSettled([getRoles(0, 200), getDepartments({ limit: 200 }), getLocations(0, 200)]);
    return { roles: results[0].status === 'fulfilled' ? results[0].value.roles : [], departments: results[1].status === 'fulfilled' ? results[1].value : [], locations: results[2].status === 'fulfilled' ? results[2].value : [] };
  }, [], { enabled: needsAdminNames });
  const entityNames = useMemo(() => {
    const names = new Map();
    const add = (id, name) => {
      const label = String(name || '').trim();
      if (id && label && !/^[0-9a-f]{24}$/i.test(label)) names.set(String(id).toLowerCase(), label);
    };
    (nvrInventory?.nvrs || []).forEach((nvr) => add(nvr._id || nvr.id, nvr.nvrName || nvr.name));
    channels.forEach((channel) => add(channel._id || channel.id, channel.customName || channel.name));
    (adminNames?.roles || []).forEach((role) => add(role._id || role.id, role.roleName || role.name));
    (adminNames?.departments || []).forEach((department) => add(department._id || department.id, department.departmentName || department.name));
    (adminNames?.locations || []).forEach((place) => add(place._id || place.id, place.locationName || place.name));
    return names;
  }, [nvrInventory, channels, adminNames]);
  const { theme } = useTheme();
  const rootRef = useRef(null);
  const [panelWidth, setPanelWidth] = useState(() => typeof window === 'undefined' ? 9999 : window.innerWidth);
  const isNarrow = panelWidth < NARROW_PX;
  const [sidebarMode, setSidebarMode] = useState(readMode);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [composerVersion, setComposerVersion] = useState(0);
  const [showAnalyticsStatus, setShowAnalyticsStatus] = useState(false);
  const [activeCard, setActiveCard] = useState(-1);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef(new Set());
  const [approvalNow, setApprovalNow] = useState(Date.now());
  useEffect(() => {
    if (!hasPendingApproval) return undefined;
    const timer = window.setInterval(() => setApprovalNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [hasPendingApproval]);
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  const proposalExpiry = Date.parse(latestAssistant?.proposal?.expiresAt);
  const expiredProposal = hasPendingApproval && latestAssistant?.status === 'approval_required'
    && (!Number.isFinite(proposalExpiry) || proposalExpiry <= approvalNow);
  const showInputToast = (message) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-1), { id, text: message, type: 'error' }]);
    const exit = window.setTimeout(() => setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, exiting: true } : toast)), timings.toastVisible);
    const remove = window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), timings.toastVisible + timings.toastExit);
    toastTimers.current.add(exit);
    toastTimers.current.add(remove);
  };
  useEffect(() => { if (threadError) showInputToast(threadError); }, [threadError]);
  useEffect(() => { if (historyError || historyApiError) showInputToast(historyError || historyApiError); }, [historyError, historyApiError]);

  const changeMode = (mode) => { setSidebarMode(mode); try { localStorage.setItem(MODE_KEY, mode); } catch { /* The layout still works without storage. */ } };
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleSidebar = () => { if (isNarrow) setMobileOpen((open) => !open); else changeMode(sidebarMode === 'collapsed' ? 'full' : 'collapsed'); };
  const startNew = useCallback(async () => { try { clearNewChatDraft(); await newChat(); setComposerVersion((version) => version + 1); setHistoryError(''); } catch { setHistoryError('Could not create a conversation. Try again.'); } }, [newChat]);
  useEffect(() => {
    const onShortcut = (event) => {
      if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && !event.repeat && event.code === 'KeyN') {
        event.preventDefault();
        startNew();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [startNew]);
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
  useEffect(() => { if (isNarrow || compact) setCapabilitiesOpen(false); }, [isNarrow, compact]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (capabilitiesOpen) setCapabilitiesOpen(false);
      else if (deleteTarget && !deleting) setDeleteTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capabilitiesOpen, deleteTarget, deleting]);

  useEffect(() => { if (!analyticsReady) return undefined; const id = window.setInterval(() => setShowAnalyticsStatus((current) => !current), timings.ticker); return () => window.clearInterval(id); }, [analyticsReady]);
  useEffect(() => { const id = window.setInterval(() => setActiveCard((current) => (current + 1) % 4), timings.card); return () => window.clearInterval(id); }, []);
  useEffect(() => () => { toastTimers.current.forEach(window.clearTimeout); }, []);

  return <div ref={rootRef} className={`agent-ui agent-workspace ${messages.length ? 'agent-has-thread' : ''} ${compact ? 'agent-compact' : ''} ${isNarrow ? 'agent-narrow' : ''}`} data-agent-theme={theme} style={compact ? panelPosition : undefined}>
    <div className="agent-glow agent-g1" /><div className="agent-glow agent-g2" />
    <svg className="agent-watermark" viewBox="0 0 100 100" aria-hidden="true"><path d="M10 15 50 85 90 15" fill="none" stroke="var(--ac, #6a2fe0)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" /></svg>
    {!compact && <ChatHistorySidebar mode={sidebarMode} mobileOpen={mobileOpen} isNarrow={isNarrow} onModeChange={changeMode} onToggle={toggleSidebar} onMobileClose={closeMobile} conversations={conversations} activeId={activeId} onSelect={selectChat} onNew={startNew} onRename={rename} onDelete={setDeleteTarget} loading={historyLoading} onError={showInputToast} getConversation={agentApi.get} />}
    <main className="agent-main">
      <div className="agent-main-content">
        <div className="agent-page-header"><Header compact={compact} sidebarCollapsed={sidebarMode === 'collapsed' && !isNarrow && !mobileOpen} onToggleSidebar={toggleSidebar} onToggleExpand={toggleExpand} onNew={startNew} onClose={closeAgent} onPanelPointerDown={onPanelPointerDown} /></div>
        <div className={`agent-app ${capabilitiesOpen ? 'show-capabilities' : ''}`}>{capabilitiesOpen && !isNarrow && !compact && <CapabilitiesDrawer onClose={() => setCapabilitiesOpen(false)} theme={theme} />}{threadLoading ? <div className="agent-thread-state" role="status">Loading conversation…</div> : messages.length ? <ChatLog messages={messages} sending={sending} onSend={ask} onRecover={(id) => recover(id).catch((error) => showInputToast(error.message))} onStop={(id) => stop(id).catch((error) => showInputToast(error.message))} onReview={reopenApproval} onNewChat={startNew} entityNames={entityNames} theme={theme} /> : <div className="agent-home-content"><Hero ticker={analyticsReady && showAnalyticsStatus ? 'Analytics report refreshed' : cameras === null ? 'Checking camera status…' : `Monitoring ${cameras} cameras live`} activeCard={activeCard} onAsk={ask} /><LiveStats cameras={cameras} detections={detections} incidents={incidents} cameraBars={cameraBars} detectionBars={detectionBars} /></div>}{uncertain?.conversationId === activeId && <div className="agent-pending-notice agent-delivery-notice" role="alert"><span className="agent-pending-icon"><CircleAlert size={17} /></span><span className="agent-pending-copy"><strong>Message delivery uncertain</strong><small>Retry safely uses the same message ID.</small></span><span className="agent-delivery-actions"><button type="button" onClick={() => retryUncertain().catch((error) => showInputToast(error.message))}>Retry</button><button type="button" onClick={discardUncertain}>Discard</button></span></div>}{hasPendingApproval && !approval && <div className="agent-pending-notice" role="status"><span className="agent-pending-icon"><CircleAlert size={16} /></span><span className="agent-pending-copy"><strong>{expiredProposal ? 'Proposal expired' : 'Change awaiting review'}</strong><small>{expiredProposal ? 'Start a new chat to continue.' : 'Nothing has changed yet.'}</small></span><button type="button" onClick={expiredProposal ? startNew : reopenApproval}>{expiredProposal ? 'Start new chat' : 'Review'} <ArrowRight size={14} /></button></div>}{(!activeId || !threadLoading) && <ChatInput key={`${activeId || 'new'}-${composerVersion}`} onSend={ask} sending={sending} lockReason={uncertain?.conversationId === activeId ? 'Delivery uncertain. Retry or discard to continue.' : expiredProposal ? 'Proposal expired. Start a new chat to continue.' : lockReason} conversationId={activeId} onToast={showInputToast} />}</div>
      </div>
    </main>
    <Toasts items={toasts} />
    <ApprovalDialog approval={approval} error={decisionError} entityNames={entityNames} onDecide={decide} onClose={dismissApproval} onNewChat={startNew} theme={theme} />
    {deleteTarget && <div className="agent-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}><div className="agent-confirm" role="alertdialog" aria-modal="true" aria-labelledby="agent-delete-title" aria-describedby="agent-delete-desc"><button className="agent-confirm-close" type="button" aria-label="Cancel delete" onClick={() => setDeleteTarget(null)}><X size={17} /></button><h2 id="agent-delete-title">Delete conversation?</h2><p id="agent-delete-desc">This chat will be removed from your history, and you won’t be able to open it again here.</p><div><button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button><button type="button" onClick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button></div></div></div>}
  </div>;
}

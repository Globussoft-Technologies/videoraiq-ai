import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, Maximize2, Minimize2, Plus, PanelLeft, PanelLeftClose, Sparkles, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import ChatHistoryRail from './ChatHistoryRail';
import EmptyState from './EmptyState';
import MessageThread from './MessageThread';
import Composer from './Composer';
import { useConversations } from '@/hooks/useConversations';
import DeleteConfirmation from '@/components/DeleteConfirmation';
import { MAX_ASSISTANT_MESSAGE_CHARS } from './assistant.copy';

const RAIL_KEY = 'vq_assistant_rail_open';
/**
 * Below this the docked rail becomes an overlay drawer. Measured on the page
 * itself, not the window, because the app sidebar (expanded or collapsed)
 * changes how much room this page actually gets — the same reason Header.jsx
 * uses a ResizeObserver instead of a media query.
 */
const NARROW_PX = 820;
const NEW_CHAT_DRAFT_KEY = '__new_chat__';

/** Slim actions row above the thread — no title, the shell header already has it. */
function ActionsRow({ railOpen, onToggleRail, onNewChat, onClose, isNarrow, mode, onModeChange }) {
  const [toggleHover, setToggleHover] = useState(false);
  const [newHover, setNewHover] = useState(false);
  const [closeHover, setCloseHover] = useState(false);
  const ToggleIcon = isNarrow ? PanelLeft : railOpen ? PanelLeftClose : PanelLeft;

  if (mode === 'compact') {
    return (
      <div
        style={{
          flex: '0 0 auto', height: 52, display: 'flex', alignItems: 'center', gap: 9,
          padding: '0 13px', borderBottom: '1px solid var(--bd)', background: 'var(--bg1solid)',
        }}
      >
        <Sparkles size={16} style={{ color: 'var(--violet)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>AI Assistant</div>
                </div>
        <button type="button" onClick={() => onModeChange('full')} title="Expand AI Assistant" aria-label="Expand AI Assistant" style={iconButtonStyle}>
          <Maximize2 size={15} strokeWidth={2} />
        </button>
        <button type="button" onClick={onClose} title="Close AI Assistant" aria-label="Close AI Assistant" style={iconButtonStyle}>
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: '0 0 auto',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 16px',
        borderBottom: '1px solid var(--bd)',
      }}
    >
      <button
        type="button"
        onClick={onToggleRail}
        onMouseEnter={() => setToggleHover(true)}
        onMouseLeave={() => setToggleHover(false)}
        title={isNarrow || !railOpen ? 'Show chat history' : 'Hide chat history'}
        aria-label={isNarrow || !railOpen ? 'Show chat history' : 'Hide chat history'}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flex: '0 0 auto',
          background: toggleHover ? 'var(--bg3)' : 'var(--bg2)',
          border: `1px solid ${toggleHover ? 'var(--bd2)' : 'var(--bd)'}`,
          color: 'var(--tx2)',
          transition: 'background .15s, border-color .15s',
        }}
      >
        <ToggleIcon size={15} strokeWidth={1.85} />
      </button>

      <button
        type="button"
        onClick={() => onModeChange('compact')}
        title="Collapse AI Assistant"
        aria-label="Collapse AI Assistant"
        style={{ ...iconButtonStyle, color: 'var(--tx2)' }}
      >
        <Minimize2 size={15} strokeWidth={2} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }} />

      <button
        type="button"
        onClick={onNewChat}
        onMouseEnter={() => setNewHover(true)}
        onMouseLeave={() => setNewHover(false)}
        title="Start a new chat"
        aria-label="Start a new chat"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          height: 34,
          padding: '0 14px',
          borderRadius: 9,
          cursor: 'pointer',
          flex: '0 0 auto',
          color: '#fff',
          fontFamily: 'var(--ui)',
          fontSize: 12.5,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          background: 'linear-gradient(135deg,var(--blue),var(--violet))',
          border: '1px solid rgba(255,255,255,.18)',
          boxShadow: newHover ? '0 8px 20px rgba(99,102,241,.42)' : '0 4px 12px rgba(99,102,241,.26)',
          transition: 'box-shadow .15s ease',
        }}
      >
        <Plus size={15} strokeWidth={2.1} />
        New chat
      </button>

      <button
        type="button"
        onClick={onClose}
        onMouseEnter={() => setCloseHover(true)}
        onMouseLeave={() => setCloseHover(false)}
        title="Close AI Assistant"
        aria-label="Close AI Assistant"
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
          cursor: 'pointer',
          color: closeHover ? 'var(--tx)' : 'var(--tx2)',
          background: closeHover ? 'var(--bg3)' : 'var(--bg2)',
          border: `1px solid ${closeHover ? 'var(--bd2)' : 'var(--bd)'}`,
          transition: 'background .15s, border-color .15s, color .15s',
        }}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

const iconButtonStyle = {
  width: 31, height: 31, borderRadius: 8, display: 'flex', alignItems: 'center',
  justifyContent: 'center', cursor: 'pointer', color: 'var(--tx2)', background: 'var(--bg2)',
  border: '1px solid var(--bd)', flex: '0 0 auto',
};

/**
 * AI Assistant — a normal V2 page (`/assistant`), so the app sidebar and header
 * stay exactly as they are on every other route. Reached from the floating
 * launcher in the bottom-right corner.
 *
 * The page fills the outlet's height and scrolls internally (thread scrolls,
 * composer stays pinned) rather than growing the outer page scroller, which is
 * what makes a chat layout usable.
 */
export default function AssistantPage({ mode = 'full', onModeChange, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [localMode, setLocalMode] = useState(mode);
  const displayMode = onModeChange ? mode : localMode;
  const handleModeChange = useCallback((nextMode) => {
    if (onModeChange) {
      onModeChange(nextMode);
      return;
    }
    // The full-page assistant is entered as a route. Collapsing it should
    // return to the originating module; the launcher then renders the compact
    // chatbot on that module instead of leaving `/assistant` in the address bar.
    if (nextMode === 'compact') {
      const returnTo = location.state?.assistantReturnTo;
      navigate(typeof returnTo === 'string' && !returnTo.startsWith('/assistant') ? returnTo : '/dashboard');
      return;
    }
    setLocalMode(nextMode);
  }, [location.state, navigate, onModeChange]);
  const incidentAssistantContext = location.state?.incidentAssistantContext;
  const {
    conversations,
    activeId,
    messages,
    sending,
    uploading,
    historyLoading,
    historyPage,
    historyPagination,
    changeHistoryPage,
    historySearch,
    changeHistorySearch,
    newChat,
    selectChat,
    deleteChat,
    renameChat,
    send,
    uploadRegisterFace,
    uploadRegisterFaces,
    stop,
  } = useConversations();

  const [draft, setDraft] = useState('');
  const draftByChatRef = useRef(new Map());
  const [pendingFiles, setPendingFiles] = useState([]);
  const pendingFilesByChatRef = useRef(new Map());
  const [clearAttachmentsToken, setClearAttachmentsToken] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const chatScrollRef = useRef(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const updateScrollDownVisibility = useCallback(() => {
    const element = chatScrollRef.current;
    if (!element) return;
    setShowScrollDown(element.scrollHeight - element.scrollTop - element.clientHeight > 56);
  }, []);

  useEffect(() => {
    const element = chatScrollRef.current;
    if (!element) return undefined;
    updateScrollDownVisibility();
    element.addEventListener('scroll', updateScrollDownVisibility, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollDownVisibility);
    resizeObserver?.observe(element);
    return () => {
      element.removeEventListener('scroll', updateScrollDownVisibility);
      resizeObserver?.disconnect();
    };
  }, [displayMode, messages.length, sending, updateScrollDownVisibility]);

  const scrollToLatest = useCallback(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  // Measure the page, not the window — see NARROW_PX.
  const rootRef = useRef(null);
  const [width, setWidth] = useState(9999);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const isNarrow = width < NARROW_PX;

  const draftKey = activeId || NEW_CHAT_DRAFT_KEY;
  const handleDraftChange = useCallback((nextDraft) => {
    setDraft(nextDraft);
    draftByChatRef.current.set(draftKey, nextDraft);
  }, [draftKey]);

  const handleFilesPrepared = useCallback((nextFiles) => {
    setPendingFiles(nextFiles);
    pendingFilesByChatRef.current.set(draftKey, nextFiles);
  }, [draftKey]);

  // Keep each conversation's unfinished input separate. Switching chats should
  // restore the draft that belongs to the selected conversation.
  useEffect(() => {
    setDraft(draftByChatRef.current.get(draftKey) || '');
    setPendingFiles(pendingFilesByChatRef.current.get(draftKey) || []);
  }, [draftKey]);

  // The desktop rail's collapsed state persists; the narrow drawer always starts
  // closed so the thread is what you land on.
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleRail = useCallback(() => {
    if (isNarrow) {
      setDrawerOpen((o) => !o);
      return;
    }
    setRailOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(RAIL_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [isNarrow]);

  // Escape closes the drawer. It deliberately does NOT navigate away — the app
  // sidebar is right there, unlike the earlier standalone version of this page.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const handleSend = useCallback(
    async (text, attachedFiles = [], { voice = false } = {}) => {
      const structuredAction = text && typeof text === 'object'
        ? text
        : (Array.isArray(attachedFiles) ? null : attachedFiles);
      const submittedText = structuredAction ? 'Continue' : text;
      if (!voice) {
        setDraft('');
        draftByChatRef.current.set(draftKey, '');
      }
      let messageText = String(submittedText || '').trim();
      if (/^(?:cancel|stop|close|exit)(?:\s+(?:user\s+)?registration)?$/i.test(String(submittedText || '').trim())) {
        setPendingFiles([]);
        pendingFilesByChatRef.current.set(draftKey, []);
        setClearAttachmentsToken((value) => value + 1);
      }
      const files = structuredAction ? [] : (attachedFiles.length ? attachedFiles : pendingFiles);
      const latestWorkflowMessage = [...messages].reverse().find((message) => message.role === 'assistant' && message.ui?.workflow === 'register_new_user');
      const hasActiveRegistration = Boolean(latestWorkflowMessage
        && !['cancelled', 'completed', 'registering'].includes(latestWorkflowMessage.ui?.status)
        && latestWorkflowMessage.ui?.type !== 'success'
        && ['review', 'form_step', 'select', 'reference_select', 'image_step', 'face_upload'].includes(latestWorkflowMessage.ui?.type));
      const startsRegistration = /\b(?:i\s+(?:want|would like)\s+to|please|start|begin)?\s*(?:register|create|add)\s+(?:(?:your\s+|the\s+)?(?:a\s+)?(?:new\s+)?(?:user|users|employee|employees))\b/i.test(String(submittedText || ''));
      // Attachments are staged until the user enters an explicit prompt. An
      // empty composer submission must never upload photos or advance a flow.
      if (!messageText) return;
      const latestRegistration = [...messages].reverse().find((item) => item.role === 'assistant' && item.ui?.workflow === 'register_new_user');
      const registrationSelect = latestRegistration?.ui?.type === 'reference_select'
        && ['department', 'location'].includes(String(latestRegistration.ui.field || '').toLowerCase())
        ? latestRegistration.ui
        : null;
      if (registrationSelect && Array.isArray(registrationSelect.options) && registrationSelect.options.length) {
        const requested = messageText.trim().toLowerCase();
        const selected = registrationSelect.options.find((option) => [option?.label, option?.value]
          .some((candidate) => String(candidate ?? '').trim().toLowerCase() === requested));
        // Canonicalize valid selections, but let invalid text reach the
        // workflow so the backend can return the validation message and the
        // same reference-select card with its authorized options.
        if (selected) messageText = String(selected.value ?? selected.label).trim();
      }
      // Bind free-text replies to the active NVR form field so a value such
      // as `NVR_AI` cannot fall through to the general data planner.
      // Only the newest assistant turn can be waiting for an NVR field. The
      // old implementation searched the whole transcript, so after the
      // password step it kept finding the stale password card and rewrote
      // later replies as `Password: Yes` / `Password: cancel`.
      const latestAssistant = [...messages].reverse().find((item) => item.role === 'assistant');
      const latestNvrStep = latestAssistant?.ui?.workflow === 'add_network_recorder'
        && latestAssistant.ui.type === 'form_step'
        && latestAssistant.ui.field
        ? latestAssistant
        : null;
      if (latestNvrStep && !/^[^\n:]{1,40}\s*:/i.test(messageText)) {
        const labels = {
          brand: 'Brand', name: 'NVR Name', location: 'Location', publicIp: 'IP',
          httpPort: 'HTTP port', rtspPort: 'RTSP port', username: 'Username', password: 'Password',
        };
        const label = labels[latestNvrStep.ui.currentStep] || labels[latestNvrStep.ui.field];
        if (label) messageText = `${label}: ${messageText}`;
      }
      // The backend validates the final message after this optional field
      // prefix is added. Keep the request within the same limit as the
      // textarea so form-field replies cannot fail after client-side input.
      if (messageText.length > MAX_ASSISTANT_MESSAGE_CHARS) {
        toast.error(`Message must be at most ${MAX_ASSISTANT_MESSAGE_CHARS} characters.`);
        return;
      }
      // A one-character accidental input such as “s” is not a usable prompt;
      // keep the selected photos staged for the user's actual instruction.
      if (files.length && messageText.length < 3) return;
      const result = await send(messageText, { action: structuredAction || undefined, incidentContext: incidentAssistantContext, attachments: files, attachmentCount: files.length });
      if (voice && result && activeIdRef.current === activeId) {
        setDraft('');
        draftByChatRef.current.set(draftKey, '');
      }
      if (startsRegistration && files.length > 0 && result?.assistantMessage?.ui?.workflow === 'register_new_user') {
        await uploadRegisterFaces({ files, conversationId: result?.conversation?.id || activeId });
        setPendingFiles([]);
        pendingFilesByChatRef.current.set(draftKey, []);
        setClearAttachmentsToken((value) => value + 1);
      } else if (files.length) {
        setPendingFiles([]);
        pendingFilesByChatRef.current.set(draftKey, []);
        setClearAttachmentsToken((value) => value + 1);
      }
      return result;
    },
    [activeId, draftKey, incidentAssistantContext, messages, pendingFiles, send, uploadRegisterFaces]
  );

  // A suggestion is a one-click question, not a prefill — sending immediately is
  // what makes the empty state a shortcut rather than a form.
  const handlePick = useCallback((text) => handleSend(text), [handleSend]);

  const handleRegisterSubmit = useCallback(
    () => send('Confirm registration', { action: 'register', workflow: 'register_new_user', step: 'review' }),
    [send]
  );

  const handleNewChat = useCallback(() => {
    newChat();
    setDraft('');
    draftByChatRef.current.set(NEW_CHAT_DRAFT_KEY, '');
    setPendingFiles([]);
    pendingFilesByChatRef.current.set(NEW_CHAT_DRAFT_KEY, []);
  }, [newChat]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteChat(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Failed to delete this chat. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [deleteChat, deleteTarget]);

  const handleRename = useCallback(
    async (id, title) => {
      try {
        await renameChat(id, title);
      } catch (error) {
        toast.error(error?.response?.data?.body?.message || 'Failed to rename this chat. Please try again.');
        throw error;
      }
    },
    [renameChat]
  );

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    const returnTo = location.state?.assistantReturnTo;
    const destination = typeof returnTo === 'string' && !returnTo.startsWith('/assistant') ? returnTo : '/dashboard';
    // Tell the launcher not to restore its compact panel after this full-page
    // assistant is closed. Collapse intentionally omits this flag so it keeps
    // the compact chatbot open on the originating module.
    navigate(destination, { state: { assistantClosed: true } });
  }, [location.state, navigate, onClose]);

  const hasThread = messages.length > 0;
  const latestRegistrationUi = [...messages].reverse().find((message) => message.role === 'assistant' && message.ui?.workflow === 'register_new_user')?.ui;
  const activeRegistrationUi = latestRegistrationUi && !['cancelled', 'completed'].includes(latestRegistrationUi.status) && latestRegistrationUi.type !== 'success'
    ? latestRegistrationUi
    : null;

  return (
    <div
      ref={rootRef}
      className={displayMode === 'compact' ? 'vq-assistant-compact' : undefined}
      style={{
        height: displayMode === 'compact' ? 'min(650px, calc(100vh - 100px))' : '100%',
        width: displayMode === 'compact' ? 'min(420px, calc(100vw - 24px))' : undefined,
        position: displayMode === 'compact' ? 'fixed' : 'relative',
        right: displayMode === 'compact' ? 24 : undefined,
        bottom: displayMode === 'compact' ? 88 : undefined,
        zIndex: displayMode === 'compact' ? 1100 : 1100,
        background: 'var(--bg1solid)',
        border: displayMode === 'compact' ? '1px solid var(--bd2)' : undefined,
        borderRadius: displayMode === 'compact' ? 16 : 0,
        boxShadow: displayMode === 'compact' ? '0 20px 60px rgba(15,23,42,.28)' : 'none',
        animation: displayMode === 'compact' ? 'vq-assistant-pop .18s ease-out' : undefined,
        display: 'flex',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {displayMode === 'full' && <ChatHistoryRail
        conversations={conversations}
        activeId={activeId}
        onSelect={selectChat}
        onNew={handleNewChat}
        onDelete={(id) => setDeleteTarget(conversations.find((conversation) => conversation.id === id) || null)}
        onRename={handleRename}
        isNarrow={isNarrow}
        open={isNarrow ? drawerOpen : railOpen}
        onClose={() => setDrawerOpen(false)}
        page={historyPage}
        pagination={historyPagination}
        onPageChange={changeHistoryPage}
        search={historySearch}
        onSearch={changeHistorySearch}
        loading={historyLoading}
      />}

      <section
        style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}
      >
        <ActionsRow
          railOpen={railOpen}
          onToggleRail={toggleRail}
          onNewChat={handleNewChat}
          onClose={handleClose}
          isNarrow={isNarrow}
          mode={displayMode}
          onModeChange={handleModeChange}
        />

        <div
          className="vq-scroll"
          ref={chatScrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            // The empty state centres itself with `margin: auto` (see
            // EmptyState) rather than `justify-content: center` here — auto
            // margins collapse to 0 when content is taller than the box, so a
            // short viewport scrolls instead of clipping the top off.
          }}
        >
          {hasThread ? (
            <MessageThread messages={messages} sending={sending} uploading={uploading} onConfirm={(ui) => ui?.workflow === 'register_new_user' ? handleRegisterSubmit() : handleSend('Yes')} onSelectOption={handleSend} onWorkflowUpload={uploadRegisterFace} onRegisterSubmit={handleRegisterSubmit} onWorkflowBatchUpload={uploadRegisterFaces} />
          ) : (
            <EmptyState onPick={handlePick} />
          )}
        </div>

        {showScrollDown && <button
          type="button"
          onClick={scrollToLatest}
          aria-label="Jump to latest message"
          style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 150, zIndex: 3, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid rgba(255,255,255,.22)', background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff', cursor: 'pointer', boxShadow: '0 8px 20px rgba(79,70,229,.3)' }}
        ><ArrowDown size={17} strokeWidth={2.2} /></button>}

        <Composer
          value={draft}
          onChange={handleDraftChange}
          onSend={handleSend}
          onStop={stop}
          conversationId={activeId}
          sending={sending}
          uploading={uploading}
          registerStep={activeRegistrationUi}
          onRegisterUpload={uploadRegisterFace}
          onRegisterBatchUpload={uploadRegisterFaces}
          files={pendingFiles}
          onFilesPrepared={handleFilesPrepared}
          clearAttachmentsToken={clearAttachmentsToken}
        />
      </section>

      <DeleteConfirmation
        open={!!deleteTarget}
        title="Delete chat"
        icon={<Trash2 className="w-7 h-7 text-[var(--crit)]" />}
        message={
          deleteTarget
            ? <>Are you sure you want to delete "{deleteTarget.title}"? This chat history cannot be recovered.</>
            : 'Are you sure you want to delete this chat?'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

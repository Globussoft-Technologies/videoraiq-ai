import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, PanelLeft, PanelLeftClose, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import ChatHistoryRail from './ChatHistoryRail';
import EmptyState from './EmptyState';
import MessageThread from './MessageThread';
import Composer from './Composer';
import { useConversations } from '@/hooks/useConversations';
import DeleteConfirmation from '@/components/DeleteConfirmation';

const RAIL_KEY = 'vq_assistant_rail_open';
/**
 * Below this the docked rail becomes an overlay drawer. Measured on the page
 * itself, not the window, because the app sidebar (expanded or collapsed)
 * changes how much room this page actually gets — the same reason Header.jsx
 * uses a ResizeObserver instead of a media query.
 */
const NARROW_PX = 820;

/** Slim actions row above the thread — no title, the shell header already has it. */
function ActionsRow({ railOpen, onToggleRail, onNewChat, onClose, isNarrow }) {
  const [toggleHover, setToggleHover] = useState(false);
  const [newHover, setNewHover] = useState(false);
  const [closeHover, setCloseHover] = useState(false);
  const ToggleIcon = isNarrow ? PanelLeft : railOpen ? PanelLeftClose : PanelLeft;

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

/**
 * AI Assistant — a normal V2 page (`/assistant`), so the app sidebar and header
 * stay exactly as they are on every other route. Reached from the floating
 * launcher in the bottom-right corner.
 *
 * The page fills the outlet's height and scrolls internally (thread scrolls,
 * composer stays pinned) rather than growing the outer page scroller, which is
 * what makes a chat layout usable.
 */
export default function AssistantPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    conversations,
    activeId,
    messages,
    sending,
    historyLoading,
    historyPage,
    historyPagination,
    changeHistoryPage,
    newChat,
    selectChat,
    deleteChat,
    renameChat,
    send,
    stop,
  } = useConversations();

  const [draft, setDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleSend = useCallback(
    (text) => {
      setDraft('');
      send(text);
    },
    [send]
  );

  // A suggestion is a one-click question, not a prefill — sending immediately is
  // what makes the empty state a shortcut rather than a form.
  const handlePick = useCallback((text) => handleSend(text), [handleSend]);

  const handleNewChat = useCallback(() => {
    newChat();
    setDraft('');
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
    const returnTo = location.state?.assistantReturnTo;
    navigate(typeof returnTo === 'string' && !returnTo.startsWith('/assistant') ? returnTo : '/dashboard');
  }, [location.state, navigate]);

  const hasThread = messages.length > 0;

  return (
    <div
      ref={rootRef}
      style={{
        height: '100%',
        display: 'flex',
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <ChatHistoryRail
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
        loading={historyLoading}
      />

      <section
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}
      >
        <ActionsRow
          railOpen={railOpen}
          onToggleRail={toggleRail}
          onNewChat={handleNewChat}
          onClose={handleClose}
          isNarrow={isNarrow}
        />

        <div
          className="vq-scroll"
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
            <MessageThread messages={messages} sending={sending} />
          ) : (
            <EmptyState onPick={handlePick} />
          )}
        </div>

        <Composer value={draft} onChange={setDraft} onSend={handleSend} onStop={stop} sending={sending} />
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

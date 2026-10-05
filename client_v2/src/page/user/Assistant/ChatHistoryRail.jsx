import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

const RAIL_WIDTH = 268;
const CHATS_PER_PAGE = 10;

function ConversationRow({ conv, active, onSelect, onDelete, onRename, editingId, onEditingChange }) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conv.title);
  const [saving, setSaving] = useState(false);
  const [titleOverflow, setTitleOverflow] = useState(0);
  const cancelBlurRef = useRef(false);
  const titleViewportRef = useRef(null);
  const titleTextRef = useRef(null);
  const count = conv.messageCount ?? conv.messages?.length ?? 0;

  useEffect(() => setDraftTitle(conv.title), [conv.title]);

  useEffect(() => {
    const checkOverflow = () => setTitleOverflow(titleViewportRef.current && titleTextRef.current
      ? Math.max(0, titleTextRef.current.scrollWidth - titleViewportRef.current.clientWidth) : 0);
    checkOverflow();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(checkOverflow);
    if (titleViewportRef.current) observer.observe(titleViewportRef.current);
    return () => observer.disconnect();
  }, [conv.title]);

  const saveTitle = async () => {
    const title = draftTitle.trim();
    if (!title || title === conv.title) {
      setDraftTitle(conv.title);
      setEditing(false);
      onEditingChange?.(null);
      return;
    }
    setSaving(true);
    try {
      await onRename(conv.id, title);
      setEditing(false);
      onEditingChange?.(null);
    } catch {
      setDraftTitle(conv.title);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    if (editingId && editingId !== conv.id) return;
    setDraftTitle(conv.title);
    setEditing(true);
    onEditingChange?.(conv.id);
  };

  return (
    <div
      onClick={() => {
        if (!editing) onSelect(conv.id);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
        padding: '9px 10px',
        borderRadius: 10,
        cursor: 'pointer',
        background: active
          ? 'linear-gradient(90deg,rgba(59,130,246,.16),rgba(168,85,247,.07))'
          : hover
            ? 'var(--bg2)'
            : 'transparent',
        boxShadow: active ? 'inset 0 0 0 1px rgba(59,130,246,.42)' : 'none',
        transition: 'background .14s',
      }}
    >
      <span style={{ minWidth: 0, flex: '1 1 0%', width: 0, overflow: 'hidden', paddingRight: hover || editing ? 60 : 0, transition: 'padding-right .14s ease' }}>
        {editing ? (
          <input
            autoFocus
            value={draftTitle}
            maxLength={90}
            disabled={saving}
            aria-label="Chat title"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveTitle();
              if (event.key === 'Escape') {
                cancelBlurRef.current = true;
                setDraftTitle(conv.title);
                setEditing(false);
              }
            }}
            onBlur={() => {
              if (cancelBlurRef.current) {
                cancelBlurRef.current = false;
                return;
              }
              saveTitle();
            }}
            style={{
              display: 'block',
              width: '100%',
              minWidth: 0,
              height: 24,
              padding: '2px 6px',
              borderRadius: 6,
              border: '1px solid var(--blue)',
              outline: 'none',
              background: 'var(--bg1solid)',
              color: 'var(--tx)',
              fontSize: 12,
            }}
          />
        ) : (
          <span
            ref={titleViewportRef}
            style={{
              display: 'block',
              overflow: 'hidden',
              paddingRight: 4,
              lineHeight: 1.35,
            }}
          >
            <span ref={titleTextRef} style={{ display: 'block', width: 'max-content', maxWidth: 'none', fontSize: 12.5, fontWeight: active ? 600 : 500, color: active ? 'var(--blue)' : 'var(--tx)', whiteSpace: 'nowrap', transform: hover && titleOverflow ? `translateX(-${titleOverflow}px)` : 'translateX(0)', transition: hover && titleOverflow ? 'transform 4.2s ease' : 'none' }}>
              {conv.title}
            </span>
          </span>
        )}
        <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>
          {count} {count === 1 ? 'message' : 'messages'}
        </span>
      </span>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setDraftTitle(conv.title);
          startEditing();
        }}
        disabled={saving}
        aria-label={`Rename chat: ${conv.title}`}
        title="Rename chat"
        style={{
          position: 'absolute', right: 34, top: '50%', transform: 'translateY(-50%)',
          width: 26,
          height: 26,
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: saving ? 'wait' : 'pointer',
          background: 'transparent',
          border: 0,
          opacity: editing ? 0 : hover ? 1 : 0,
          pointerEvents: editing ? 'none' : 'auto',
          color: 'var(--tx3)',
          transition: 'opacity .14s ease',
        }}
      >
        <Pencil size={13} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conv.id);
        }}
        aria-label={`Delete chat: ${conv.title}`}
        title="Delete chat"
        style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          width: 26,
          height: 26,
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: 'transparent',
          border: 0,
          opacity: hover ? 1 : 0,
          transition: 'opacity .14s, color .14s, background .14s',
          color: hover ? 'var(--crit)' : 'var(--tx3)',
        }}
      >
        <Trash2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}

/**
 * Left rail listing saved threads. Docked on desktop; an overlay drawer below
 * the narrow breakpoint, where a 268px rail would leave the thread unusable.
 */
export default function ChatHistoryRail({
  conversations = [],
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  isNarrow = false,
  open = true,
  onClose,
  page = 1,
  pagination = { page: 1, limit: CHATS_PER_PAGE, total: 0, totalPages: 1 },
  onPageChange,
  loading = false,
  search = '',
  onSearch,
}) {
  const [newHover, setNewHover] = useState(false);
  const [historyHovered, setHistoryHovered] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const listRef = useRef(null);
  const totalPages = Math.max(1, pagination.totalPages || 1);
  const pageSize = pagination.limit || CHATS_PER_PAGE;
  const total = pagination.total || 0;
  const pageStart = (page - 1) * pageSize;

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const select = (id) => {
    onSelect(id);
    if (isNarrow) onClose?.();
  };

  const inner = (
    <>
      {/* Rail header */}
      <div
        style={{
          flex: '0 0 auto',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 14px',
          borderBottom: '1px solid var(--bd)',
        }}
      >
        <MessageSquare size={15} strokeWidth={1.9} style={{ color: 'var(--tx2)', flex: '0 0 auto' }} />
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13, flex: 1 }}>Chat history</span>
        {isNarrow && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat history"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg2)',
              border: '1px solid var(--bd)',
              color: 'var(--tx2)',
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
          >
            <X size={15} strokeWidth={1.9} />
          </button>
        )}
      </div>

      {/* New chat */}
      <div style={{ flex: '0 0 auto', padding: 14 }}>
        <button
          type="button"
          onClick={() => {
            onNew();
            if (isNarrow) onClose?.();
          }}
          onMouseEnter={() => setNewHover(true)}
          onMouseLeave={() => setNewHover(false)}
          style={{
            width: '100%',
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 10,
            cursor: 'pointer',
            color: '#fff',
            fontFamily: 'var(--ui)',
            fontSize: 13,
            fontWeight: 600,
            background: 'linear-gradient(135deg,var(--blue),var(--violet))',
            border: '1px solid rgba(255,255,255,.18)',
            boxShadow: newHover ? '0 8px 22px rgba(99,102,241,.42)' : '0 4px 14px rgba(99,102,241,.26)',
            transition: 'box-shadow .15s ease',
          }}
        >
          <Plus size={17} strokeWidth={2.1} />
          New chat
        </button>

        <label
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            marginTop: 10,
          }}
        >
          <Search
            size={15}
            strokeWidth={1.9}
            aria-hidden="true"
            style={{ position: 'absolute', left: 10, color: 'var(--tx3)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            value={search}
            onChange={(event) => onSearch?.(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            style={{
              width: '100%',
              height: 36,
              padding: '0 34px 0 32px',
              borderRadius: 9,
              border: '1px solid var(--bd)',
              outline: 'none',
              background: 'var(--bg2)',
              color: 'var(--tx)',
              fontFamily: 'var(--ui)',
              fontSize: 12,
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch?.('')}
              aria-label="Clear chat search"
              title="Clear search"
              style={{
                position: 'absolute',
                right: 4,
                top: 4,
                width: 28,
                height: 28,
                display: 'grid',
                placeItems: 'center',
                padding: 0,
                border: 0,
                borderRadius: 7,
                background: 'transparent',
                color: 'var(--blue)',
                cursor: 'pointer',
              }}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          )}
        </label>
      </div>

      {/* Thread list */}
      <div
        ref={listRef}
        className="vq-scroll chat-history-list"
        onMouseEnter={() => setHistoryHovered(true)}
        onMouseLeave={() => setHistoryHovered(false)}
        style={{ flex: 1, minHeight: 0, overflowY: historyHovered ? 'auto' : 'hidden', padding: '0 2px 14px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}
      >
        {loading ? (
          <div style={{ padding: '18px 12px', fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center' }}>
            Loading chats…
          </div>
        ) : conversations.length === 0 ? (
          <div
            style={{
              padding: '18px 12px',
              fontSize: 11.5,
              lineHeight: 1.6,
              color: 'var(--tx3)',
              textAlign: 'center',
            }}
          >
            {search.trim() ? 'No chats match your search.' : 'No conversations yet. Your chats will appear here.'}
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              active={conv.id === activeId}
              onSelect={select}
              onDelete={onDelete}
              onRename={onRename}
              editingId={editingId}
              onEditingChange={setEditingId}
            />
          ))
        )}
      </div>

      {false && totalPages > 1 && (
        <div
          style={{
            flex: '0 0 auto',
            display: 'grid',
            gridTemplateColumns: '30px 1fr 30px',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px 12px',
            borderTop: '1px solid var(--bd)',
            background: 'var(--bg1solid)',
          }}
        >
          <button
            type="button"
            onClick={() => onPageChange?.(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="Previous chat-history page"
            title="Previous page"
            style={{
              width: 30,
              height: 30,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              color: page === 1 ? 'var(--tx3)' : 'var(--tx)',
              background: 'var(--bg2)',
              border: '1px solid var(--bd)',
              opacity: page === 1 ? 0.45 : 1,
            }}
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </button>

          <div style={{ minWidth: 0, textAlign: 'center', lineHeight: 1.25 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx2)' }}>
              Page {page} of {totalPages}
            </div>
            <div style={{ marginTop: 2, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)' }}>
              {pageStart + 1}–{Math.min(pageStart + pageSize, total)} of {total}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            aria-label="Next chat-history page"
            title="Next page"
            style={{
              width: 30,
              height: 30,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              color: page === totalPages ? 'var(--tx3)' : 'var(--tx)',
              background: 'var(--bg2)',
              border: '1px solid var(--bd)',
              opacity: page === totalPages ? 0.45 : 1,
            }}
          >
            <ChevronRight size={15} strokeWidth={2} />
          </button>
        </div>
      )}
    </>
  );

  if (isNarrow) {
    return (
      <>
        {open && (
          <div
            // Only dismiss when the backdrop itself is clicked. The backdrop
            // spans the page, so bubbling clicks from the chat composer would
            // otherwise close the history drawer while the user is typing.
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose?.();
            }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 40 }}
          />
        )}
        {/* Absolute, not fixed: the drawer belongs to the page area so it never
            slides over the app's own header and sidebar. */}
        <aside
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: RAIL_WIDTH,
            maxWidth: '84vw',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg1solid)',
            borderRight: '1px solid var(--bd)',
            zIndex: 41,
            transform: open ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform .25s ease',
            boxShadow: open ? '0 0 40px rgba(0,0,0,.42)' : 'none',
          }}
        >
          {inner}
        </aside>
      </>
    );
  }

  return (
    <aside
      style={{
        width: open ? RAIL_WIDTH : 0,
        flex: `0 0 ${open ? RAIL_WIDTH : 0}px`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--glass)',
        backdropFilter: 'blur(14px)',
        borderRight: open ? '1px solid var(--bd)' : '0',
        transition: 'width .2s ease, flex-basis .2s ease',
      }}
    >
      {open && inner}
    </aside>
  );
}

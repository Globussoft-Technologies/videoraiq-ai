import { useState } from 'react';
import { MessageSquare, Plus, Trash2, X } from 'lucide-react';

const RAIL_WIDTH = 268;

function ConversationRow({ conv, active, onSelect, onDelete }) {
  const [hover, setHover] = useState(false);
  const count = conv.messages?.length || 0;

  return (
    <div
      onClick={() => onSelect(conv.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={conv.title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
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
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: active ? 600 : 500,
            color: active ? 'var(--blue)' : 'var(--tx)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.35,
          }}
        >
          {conv.title}
        </span>
        <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>
          {count} {count === 1 ? 'message' : 'messages'}
        </span>
      </span>

      {/* Delete only materialises on hover so the list stays calm at rest. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conv.id);
        }}
        aria-label={`Delete chat: ${conv.title}`}
        title="Delete chat"
        style={{
          flex: '0 0 auto',
          width: 26,
          height: 26,
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: 'transparent',
          border: 0,
          color: 'var(--tx3)',
          opacity: hover ? 1 : 0,
          transition: 'opacity .14s',
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
  isNarrow = false,
  open = true,
  onClose,
}) {
  const [newHover, setNewHover] = useState(false);

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
      </div>

      {/* Thread list */}
      <div
        className="vq-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}
      >
        {conversations.length === 0 ? (
          <div
            style={{
              padding: '18px 12px',
              fontSize: 11.5,
              lineHeight: 1.6,
              color: 'var(--tx3)',
              textAlign: 'center',
            }}
          >
            No conversations yet. Your chats will appear here.
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              active={conv.id === activeId}
              onSelect={select}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </>
  );

  if (isNarrow) {
    return (
      <>
        {open && (
          <div
            onClick={onClose}
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from 'lucide-react';
import { VideoraBrand } from './Header';

const GROUPS = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
const dateGroup = (value) => {
  const date = new Date(value || 0); const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.floor((midnight - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'Previous 7 Days' : days < 30 ? 'Previous 30 Days' : 'Older';
};
const formatTime = (value) => { const date = new Date(value || 0); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

function ConversationRow({ conversation, selected, onSelect, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title || 'New chat');
  const [saving, setSaving] = useState(false);
  const rowRef = useRef(null);
  const inputRef = useRef(null);
  const cancelBlurRef = useRef(false);
  useEffect(() => {
    if (!editing || !inputRef.current) return;
    inputRef.current.focus();
    const end = inputRef.current.value.length;
    inputRef.current.setSelectionRange(end, end);
  }, [editing]);
  useEffect(() => { if (!editing) setTitle(conversation.title || 'New chat'); }, [conversation.title, editing]);
  const saveTitle = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try { await onRename(conversation.id, title); setEditing(false); } catch { /* Parent displays the error. */ }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => { if (!rowRef.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);
  return <div ref={rowRef} className={`agent-history-row ${selected ? 'selected' : ''}`}>
    {editing ? <div className="agent-history-rename"><input ref={inputRef} value={title} maxLength={80} disabled={saving} aria-label="Conversation title" onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveTitle(); } if (event.key === 'Escape') { cancelBlurRef.current = true; setEditing(false); setTitle(conversation.title || 'New chat'); } }} onBlur={() => { if (cancelBlurRef.current) { cancelBlurRef.current = false; return; } saveTitle(); }} /><small>{conversation.messageCount == null ? 'Messages unavailable' : `${conversation.messageCount} ${conversation.messageCount === 1 ? 'message' : 'messages'}`}</small></div> : <>
      <button type="button" className="agent-history-select" onClick={() => onSelect(conversation.id)} aria-current={selected ? 'page' : undefined}><MessageCircle size={15} /><span className="agent-history-copy"><strong>{conversation.activeRun && <i className="agent-active-dot" aria-label="In progress" />} {conversation.title || 'New chat'}</strong><small>{conversation.messageCount == null ? 'Messages unavailable' : `${conversation.messageCount} ${conversation.messageCount === 1 ? 'message' : 'messages'}`}</small></span><time dateTime={conversation.lastActivityAt || conversation.updatedAt}>{formatTime(conversation.lastActivityAt || conversation.updatedAt)}</time></button>
    </>}
    <button type="button" className="agent-history-menu-button" aria-label={`Options for ${conversation.title || 'conversation'}`} aria-expanded={menuOpen} onClick={() => { if (!editing) setMenuOpen((open) => !open); }}><MoreHorizontal size={16} /></button>
    {!editing && menuOpen && <div className="agent-history-menu"><button type="button" onClick={() => { setMenuOpen(false); setTitle(conversation.title || 'New chat'); setEditing(true); }}>Rename</button><button type="button" onClick={() => { setMenuOpen(false); onDelete(conversation); }}>Delete</button></div>}
  </div>;
}

export default function ChatHistorySidebar({ mode, mobileOpen, isNarrow, onModeChange, onToggle, onMobileClose, conversations, activeId, onSelect, onNew, onRename, onDelete, loading, onError }) {
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  useEffect(() => { if (searchError) onError?.(searchError); }, [searchError]);
  const searchInput = useRef(null);
  useEffect(() => { if (!mobileOpen) return; const onKey = (event) => { if (event.key === 'Escape') onMobileClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [mobileOpen, onMobileClose]);
  useEffect(() => { const query = search.trim().toLocaleLowerCase(); setMatches(query ? new Set(conversations.filter((conversation) => (conversation.title || '').toLocaleLowerCase().includes(query)).map((conversation) => conversation.id)) : null); setSearching(false); setSearchError(''); }, [search, conversations]);
  const groups = useMemo(() => { const result = Object.fromEntries(GROUPS.map((group) => [group, []])); conversations.filter((conversation) => !matches || matches.has(conversation.id)).forEach((conversation) => result[dateGroup(conversation.createdAt)].push(conversation)); return result; }, [conversations, matches]);
  const count = Object.values(groups).reduce((total, group) => total + group.length, 0);
  const select = (id) => { onSelect(id);onMobileClose(); };
  const startNew = () => { onNew();onMobileClose(); };
  useEffect(() => { const onKey = (event) => { if (event.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) { event.preventDefault(); if (mode === 'collapsed') onModeChange('full'); window.setTimeout(() => searchInput.current?.focus(), 0); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [mode, onModeChange]);
  return <><button type="button" className={`agent-drawer-backdrop ${mobileOpen ? 'open' : ''}`} aria-label="Close chat history" onClick={onMobileClose} /><aside className={`agent-sidebar mode-${mode} ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Chat history" aria-hidden={isNarrow && !mobileOpen} inert={isNarrow && !mobileOpen}>
    <div className="agent-sidebar-header"><div className="agent-sidebar-brand">{(mode !== 'collapsed' || mobileOpen) && <VideoraBrand sidebar />}</div><button type="button" className="agent-sidebar-toggle" aria-label={mode === 'collapsed' ? 'Expand chat history' : 'Collapse chat history'} title={mode === 'collapsed' ? 'Expand chat history' : 'Collapse chat history'} onClick={onToggle}>{mode === 'collapsed' ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button><button type="button" className="agent-sidebar-mobile-close cursor-pointer" aria-label="Close chat history" onClick={onMobileClose}><X size={17} /></button></div>
    {mode === 'collapsed' && !mobileOpen && !isNarrow ? <div className="agent-sidebar-icons"><button type="button" title="New chat" aria-label="New chat" onClick={startNew}><Plus size={19} /></button><button type="button" title="Search conversations" aria-label="Search conversations" onClick={() => { onModeChange('full'); window.setTimeout(() => searchInput.current?.focus(), 0); }}><Search size={18} /></button><button type="button" title="Chat history" aria-label="Open chat history" onClick={() => onModeChange('full')}><MessageCircle size={18} /></button></div> : <><button className="agent-new-chat" type="button" onClick={startNew}><Plus size={17} />New conversation<span className="agent-new-chat-shortcut">Ctrl Alt N</span></button><label className="agent-history-search"><Search size={16} /><input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}<kbd>/</kbd></label><div className="agent-history-list" aria-live="polite">{loading || searching ? <p className="agent-history-state">Loading conversations…</p> : count === 0 ? <p className="agent-history-state">{search ? 'No matching conversations.' : 'No conversations yet. Start a new chat.'}</p> : GROUPS.map((group) => groups[group].length > 0 && <section key={group}><h2>{group === 'Today' ? 'Recent' : group}</h2>{groups[group].map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} selected={activeId === conversation.id} onSelect={select} onRename={onRename} onDelete={onDelete} />)}</section>)}</div></>}
  </aside></>;
}

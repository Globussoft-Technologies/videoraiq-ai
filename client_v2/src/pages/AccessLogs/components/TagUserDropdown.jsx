import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Loader2, Tag } from 'lucide-react';
import { authorizedUsers } from '../Api';

const nasUrl = import.meta.env.VITE_BACKEND || '';

/** Small local debounce so the search input doesn't hit the API on every keystroke. */
const useDebounce = (value, delay = 400) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const getInitialsPlaceholder = (firstName, lastName) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const colors = ['var(--brand)', '#CFEFFF', '#E3F5FF'];
  const textColors = ['#FFFFFF', 'var(--brand)', 'var(--brand)'];
  const idx = initials.charCodeAt(0) % colors.length;
  const svg = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="20" fill="${colors[idx]}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="${textColors[idx]}" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

/**
 * Floating dropdown that lists authorized users (profile image + username +
 * tagged/untagged pill). Clicking a user calls onSelect(user). Positioned next
 * to the anchor element via a portal so it isn't clipped by table overflow.
 */
const PAGE_SIZE = 10;

const TagUserDropdown = ({ anchorRect, busy, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      fetchingRef.current = true;
      try {
        const res = await authorizedUsers(0, PAGE_SIZE, debouncedSearch || '');
        if (!cancelled && res?.body?.status === 'success') {
          setUsers(res.body.data.users || []);
          setTotalCount(res.body.data.totalCount || 0);
          if (listRef.current) listRef.current.scrollTop = 0;
        }
      } catch (err) {
        console.error('Failed to load authorized users', err);
      } finally {
        if (!cancelled) setLoading(false);
        fetchingRef.current = false;
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const loadMore = async () => {
    if (fetchingRef.current) return;
    if (users.length >= totalCount) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const res = await authorizedUsers(users.length, PAGE_SIZE, debouncedSearch || '');
      if (res?.body?.status === 'success') {
        setUsers((prev) => [...prev, ...(res.body.data.users || [])]);
        setTotalCount(res.body.data.totalCount || 0);
      }
    } catch (err) {
      console.error('Failed to load more authorized users', err);
    } finally {
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  };

  const handleScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) loadMore();
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Cap the panel to the viewport so it never overflows on small screens.
  const PANEL_W = Math.min(300, window.innerWidth - 16);
  const PANEL_H = 360;
  const top =
    anchorRect.bottom + PANEL_H > window.innerHeight
      ? Math.max(8, anchorRect.top - PANEL_H - 6)
      : anchorRect.bottom + 6;
  const left = Math.min(
    Math.max(8, anchorRect.right - PANEL_W),
    window.innerWidth - PANEL_W - 8
  );

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top, left, width: PANEL_W, maxHeight: PANEL_H }}
      className="z-[200] bg-[var(--bg1solid)] rounded-xl shadow-xl border border-[var(--bd)] flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-[var(--bd)]">
        <div className="relative">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users"
            className="w-full pl-3 pr-9 h-9 text-xs border border-[var(--bd)] rounded-lg text-[var(--tx2)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx2)]" />
        </div>
      </div>

      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--tx3)]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-[var(--tx3)] text-xs">No users found.</div>
        ) : (
          users.map((u) => {
            const tagged = !!u.tag;
            const avatar =
              u.profilePics && u.profilePics.length > 0
                ? `${nasUrl}/api/v1/uploads${u.profilePics[0]}`
                : getInitialsPlaceholder(u.firstName, u.lastName);
            return (
              <button
                key={u._id}
                type="button"
                disabled={busy}
                onClick={() => onSelect(u)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg2)] transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <img
                  src={avatar}
                  alt={u.userName}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = getInitialsPlaceholder(u.firstName, u.lastName);
                  }}
                  className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-[var(--bd)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--tx)] truncate">
                    {u.userName || `${u.firstName} ${u.lastName}`}
                  </p>
                  <p className="text-[10px] text-[var(--tx3)] truncate">{u.email}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border whitespace-nowrap shrink-0 ${
                    tagged
                      ? 'bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20'
                      : 'bg-[var(--bg2)] text-[var(--tx3)] border-[var(--bd)]'
                  }`}
                >
                  <Tag className="w-2.5 h-2.5" fill={tagged ? 'currentColor' : 'none'} />
                  {tagged ? 'Tagged' : 'Untagged'}
                </span>
              </button>
            );
          })
        )}

        {loadingMore && !loading && (
          <div className="flex items-center justify-center py-3 text-[var(--tx3)]">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default TagUserDropdown;

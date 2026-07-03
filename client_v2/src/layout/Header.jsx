import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Bell, Sun, Moon, ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useClock } from '../hooks/useClock';
import { useAttendanceSocket } from '../context/AttendanceSocketContext';
import { NAV_GROUPS } from './nav.config';
import { getChannels } from '../helpers/monitoring';

// Static index of navigable pages, built once from the sidebar config.
const PAGE_INDEX = NAV_GROUPS.filter((g) => !g.hidden).flatMap((g) =>
  g.items.map((it) => ({
    kind: 'Page',
    kindColor: 'var(--blue)',
    label: it.label,
    sub: g.label,
    to: `/${it.path}`,
  }))
);

const iconBtn = {
  width: 36,
  height: 36,
  borderRadius: 9,
  background: 'var(--bg2)',
  border: '1px solid var(--bd)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flex: '0 0 auto',
};

export default function Header({ title, sub, sites = [], siteFilter = 'All Sites', onSiteChange, notifications = [], onSearch }) {
  const { theme, setTheme } = useTheme();
  const clock = useClock();
  const navigate = useNavigate();
  const [siteOpen, setSiteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameras, setCameras] = useState([]);
  const camLoaded = useRef(false);
  const inputRef = useRef(null);
  const { isMuted, toggleMute } = useAttendanceSocket() || {};

  // Lazily load the camera list the first time the search is focused.
  const loadCameras = () => {
    if (camLoaded.current) return;
    camLoaded.current = true;
    getChannels({ limit: 200 })
      .then((chs) => setCameras(Array.isArray(chs) ? chs : []))
      .catch(() => {});
  };

  const onSearchFocus = () => {
    setSearchOpen(true);
    loadCameras();
  };

  // ⌘K / Ctrl+K focuses the search box (matches the badge hint).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Build ranked results across pages, sites and cameras for the current query.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const p of PAGE_INDEX) {
      if (p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q)) out.push(p);
    }
    cameras.forEach((c, idx) => {
      // Positional CAM-00x label — same scheme the Live Wall grid uses (CameraGrid.jsx).
      const camLabel = `CAM-${String(idx + 1).padStart(3, '0')}`;
      const name = c.customName || c.name || c.channelName || c.aliasName || (c.channelId != null ? String(c.channelId) : '');
      // Match on either the CAM code or the camera name so both work.
      if (!`${camLabel} ${name}`.toLowerCase().includes(q)) return;
      const camId = c._id || c.channelId;
      out.push({
        kind: 'Camera',
        kindColor: 'var(--ok)',
        label: name || camLabel,
        sub: camLabel,
        // Live Wall opens a camera fullscreen via the ?cam=<id> deep-link param.
        to: `/live?cam=${encodeURIComponent(camId)}`,
      });
    });
    return out.slice(0, 12);
  }, [query, cameras]);

  const goResult = (r) => {
    navigate(r.to, r.state ? { state: r.state } : undefined);
    setSearchOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const trimmed = query.trim();
  const showResults = searchOpen && trimmed && results.length > 0;
  const showNoResults = searchOpen && trimmed && results.length === 0;

  const themeBtn = (active) => ({
    width: 30,
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: active ? 'var(--blue)' : 'var(--tx3)',
    background: active ? 'var(--bg1solid)' : 'transparent',
  });

  return (
    <header
      style={{
        height: 60,
        flex: '0 0 60px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 22px',
        borderBottom: '1px solid var(--bd)',
        background: 'var(--headerglass)',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        zIndex: 60,
      }}
    >
      <div style={{ flex: '0 0 auto' }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 17, letterSpacing: '-.01em', lineHeight: 1, whiteSpace: 'nowrap' }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3, whiteSpace: 'nowrap' }}>{sub}</div>
      </div>

      <div style={{ flex: 1, minWidth: 12 }} />

      {/* Search */}
      <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, maxWidth: 280 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 36,
            padding: '0 13px',
            borderRadius: 9,
            background: 'var(--bg2)',
            border: `1px solid ${searchOpen ? 'var(--blue)' : 'var(--bd)'}`,
            color: 'var(--tx3)',
            overflow: 'hidden',
          }}
        >
          <Search size={15} strokeWidth={1.8} style={{ flex: '0 0 auto' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
              onSearch?.(e.target.value);
            }}
            onFocus={onSearchFocus}
            placeholder="Search cameras, events, plates…"
            style={{ fontSize: 12.5, flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)' }}
          />
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', border: '1px solid var(--bd)', borderRadius: 4, padding: '1px 5px', flex: '0 0 auto' }}>
            ⌘K
          </span>
        </div>

        {searchOpen && trimmed && (
          <div onMouseDown={() => setSearchOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
        )}
        {searchOpen && trimmed && (
          <div
            className="vq-fadeup"
            style={{
              position: 'absolute',
              top: 44,
              left: 0,
              width: 344,
              maxWidth: '86vw',
              background: 'var(--bg1solid)',
              border: '1px solid var(--bd2)',
              borderRadius: 12,
              boxShadow: '0 18px 50px rgba(0,0,0,.6)',
              zIndex: 60,
              overflow: 'hidden',
            }}
          >
            {showResults && (
              <div className="vq-scroll" style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
                {results.map((r, i) => (
                  <div
                    key={`${r.kind}-${r.label}-${i}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      goResult(r);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: r.kindColor, flex: '0 0 auto' }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{r.sub}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', border: '1px solid var(--bd)', borderRadius: 5, padding: '2px 6px', flex: '0 0 auto' }}>{r.kind}</span>
                  </div>
                ))}
              </div>
            )}

            {showNoResults && (
              <div style={{ padding: '22px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--tx3)' }}>
                No matches for “{trimmed}”
              </div>
            )}
          </div>
        )}
      </div>

      {/* Site switcher */}
      <div style={{ position: 'relative', flex: '0 0 auto' }}>
        <div
          onClick={() => setSiteOpen((o) => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 12px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer' }}
        >
          <MapPin size={14} strokeWidth={1.8} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 12.5, color: 'var(--tx)', fontWeight: 500, whiteSpace: 'nowrap' }}>{siteFilter}</span>
          {sites.length > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{sites.length}</span>}
          <ChevronDown size={14} strokeWidth={1.7} style={{ color: 'var(--tx3)' }} />
        </div>
        {siteOpen && (
          <>
            <div onClick={() => setSiteOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
            <div
              className="vq-fadeup"
              style={{ position: 'absolute', top: 44, right: 0, width: 228, background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.6)', zIndex: 60, padding: 6 }}
            >
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--tx3)', padding: '6px 9px 4px' }}>SWITCH SITE</div>
              {['All Sites', ...sites].map((s) => {
                const label = typeof s === 'string' ? s : s.locationName || s.name;
                const active = label === siteFilter;
                return (
                  <div
                    key={label}
                    onClick={() => {
                      onSiteChange?.(label, s);
                      setSiteOpen(false);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 9, cursor: 'pointer', color: active ? 'var(--blue)' : 'var(--tx2)', fontSize: 12.5, fontWeight: active ? 600 : 500 }}
                  >
                    <MapPin size={13} strokeWidth={1.8} style={{ flex: '0 0 auto', opacity: 0.8 }} />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* UTC clock */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--tx2)', letterSpacing: '.02em' }}>{clock}</div>

      {/* Theme toggle */}
      <div style={{ display: 'flex', gap: 3, height: 36, padding: 3, borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)' }} title="Theme">
        <div onClick={() => setTheme('light')} style={themeBtn(theme === 'light')}>
          <Sun size={15} strokeWidth={1.8} />
        </div>
        <div onClick={() => setTheme('dark')} style={themeBtn(theme === 'dark')}>
          <Moon size={15} strokeWidth={1.8} />
        </div>
      </div>

      {/* Audio alarm mute toggle */}
      {toggleMute && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute detection audio' : 'Mute detection audio'}
          title={isMuted ? 'Unmute detection audio' : 'Mute detection audio'}
          style={iconBtn}
        >
          {isMuted ? (
            <VolumeX size={17} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
          ) : (
            <Volume2 size={17} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
          )}
        </button>
      )}

      {/* Notifications */}
      <div style={{ position: 'relative', flex: '0 0 auto' }}>
        <div onClick={() => setNotifOpen((o) => !o)} style={{ ...iconBtn, position: 'relative' }}>
          <Bell size={17} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
          {notifications.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                background: 'var(--crit)',
                color: '#fff',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                boxShadow: '0 0 8px rgba(255,77,77,.6)',
              }}
            >
              {notifications.length}
            </span>
          )}
        </div>
        {notifOpen && (
          <>
            <div onClick={() => setNotifOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
            <div
              className="vq-fadeup"
              style={{ position: 'absolute', top: 44, right: 0, width: 332, maxWidth: '86vw', background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.6)', zIndex: 60, overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--bd)' }}>
                <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5 }}>Notifications</span>
                {notifications.length > 0 && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#fff', background: 'var(--crit)', borderRadius: 8, padding: '1px 7px' }}>
                    {notifications.length} new
                  </span>
                )}
              </div>
              <div className="vq-scroll" style={{ maxHeight: 332, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 22, textAlign: 'center', fontSize: 12, color: 'var(--tx3)' }}>You're all caught up</div>
                ) : (
                  notifications.map((n, i) => (
                    <div key={n.id || i} onClick={n.go} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--bd)', cursor: 'pointer' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.sevColor || 'var(--warn)', boxShadow: `0 0 7px ${n.sevColor || 'var(--warn)'}`, flex: '0 0 auto', marginTop: 5 }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{[n.cam, n.time].filter(Boolean).join(' · ')}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

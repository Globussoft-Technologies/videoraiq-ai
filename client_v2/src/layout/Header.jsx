import { memo, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Bell, Sun, Moon, ChevronDown, Volume2, VolumeX, SunMoon, Menu } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useClock } from '../hooks/useClock';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { useAttendanceSocket } from '../context/AttendanceSocketContext';
import { NAV_GROUPS } from './nav.config';
import { getChannels } from '../helpers/monitoring';
import { networkRatingInfo } from '../lib/networkStatus';
import { timeAgo } from '../lib/format';
import StartTourMenu from '../components/Tour/StartTourMenu';

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

const clockStyle = {
  fontFamily: 'var(--mono)',
  fontSize: 13,
  color: 'var(--tx2)',
  letterSpacing: '.02em',
  width: 122,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  flex: '0 0 auto',
};

const centeredClockStyle = {
  ...clockStyle,
  width: '100%',
  textAlign: 'center',
};

const HeaderClock = memo(function HeaderClock({ compact = false }) {
  const clock = useClock();
  return <div style={compact ? centeredClockStyle : clockStyle}>{clock}</div>;
});

function networkLabelForCard(network) {
  if (!network?.baseUrl) return 'Server';
  try {
    const parsed = new URL(network.baseUrl);
    return parsed.hostname || parsed.origin || network.baseUrl;
  } catch {
    return network.baseUrl;
  }
}

function Header({ title, sub, sites = [], siteFilter = 'All Sites', onSiteChange, serverNetwork = null, notifications = [], unreadCount, onMarkNotificationsRead, onSearch, onMenuClick }) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [siteOpen, setSiteOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameras, setCameras] = useState([]);
  const camLoaded = useRef(false);
  const inputRef = useRef(null);
  const searchRef = useRef(null);
  const siteRef = useRef(null);
  const networkRef = useRef(null);
  const notifRef = useRef(null);
  const moreRef = useRef(null);
  const audioRef = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [lineCrossingMuted, setLineCrossingMuted] = useState(() => {
    try { return localStorage.getItem('lineCrossingAudioMuted') !== 'false'; } catch { return true; }
  });
  const { isMuted, audioEnabled, setAudioEnabled } = useAttendanceSocket() || {};
  const unreadNum = unreadCount ?? notifications.length;

  // The header drops widgets progressively as IT gets narrow — measured with a
  // ResizeObserver on the header itself, not the window, because the sidebar
  // (collapsed/expanded) changes how much room the header actually has. This
  // guarantees the core controls (search, site, mute, notifications) never get
  // clipped off the right edge.
  const headerRef = useRef(null);
  const [headerW, setHeaderW] = useState(9999);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) {
        const next = Math.round(w);
        setHeaderW((prev) => (prev === next ? prev : next));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hideClock = headerW < 900; // clock is the widest widget — drop it first
  const isNarrow = headerW < 620; // collapse search to an icon + compact the site switcher
  // On the tightest widths, drop the theme toggle before the essential controls
  // (site, mute, notifications) so the notification bell is never clipped.
  const hideTheme = headerW < 540;
  const hideNetwork = headerW < 760;

  const serverNetworks = useMemo(() => {
    if (Array.isArray(serverNetwork)) return serverNetwork.filter(Boolean);
    if (Array.isArray(serverNetwork?.server_networks)) return serverNetwork.server_networks.filter(Boolean);
    return serverNetwork ? [serverNetwork] : [];
  }, [serverNetwork]);
  const primaryServerNetwork = serverNetworks[0] || null;
  const { rating: networkRating, color: networkColor, label: networkRatingLabel } = networkRatingInfo(primaryServerNetwork);
  const networkPillLabel = serverNetworks.length > 1 ? `${serverNetworks.length} servers` : networkRatingLabel;

  // Close each dropdown on an outside click / Escape (replaces the fixed-overlay
  // backdrops, which are trapped inside the header's backdrop-filter box).
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeSite = useCallback(() => setSiteOpen(false), []);
  const closeNetwork = useCallback(() => setNetworkOpen(false), []);
  const closeNotif = useCallback(() => setNotifOpen(false), []);
  const closeAudio = useCallback(() => setAudioOpen(false), []);
  // Opening the panel is the "seen" signal — clears the unread badge, same as
  // any standard notification tray (Slack, GitHub, etc).
  const openNotif = useCallback(() => {
    setNotifOpen((o) => {
      const next = !o;
      if (next) onMarkNotificationsRead?.(notifications.map((n) => n.id));
      return next;
    });
  }, [notifications, onMarkNotificationsRead]);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useOutsideClick(searchRef, searchOpen, closeSearch);
  useOutsideClick(siteRef, siteOpen, closeSite);
  useOutsideClick(networkRef, networkOpen, closeNetwork);
  useOutsideClick(notifRef, notifOpen, closeNotif);
  useOutsideClick(moreRef, moreOpen, closeMore);
  useOutsideClick(audioRef, audioOpen, closeAudio);

  useEffect(() => {
    const handleLineAudio = (event) => {
      if (typeof event.detail?.muted === 'boolean') setLineCrossingMuted(event.detail.muted);
    };
    window.addEventListener('line-crossing-audio-change', handleLineAudio);
    return () => window.removeEventListener('line-crossing-audio-change', handleLineAudio);
  }, []);

  const setLineCrossingAudioMuted = useCallback((muted) => {
    setLineCrossingMuted(muted);
    try { localStorage.setItem('lineCrossingAudioMuted', String(muted)); } catch {}
    window.dispatchEvent(new CustomEvent('line-crossing-audio-change', { detail: { muted } }));
  }, []);

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

  // Ctrl+K / Cmd+K focuses the search box.
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

  // Search results list — shared by the desktop dropdown and the mobile overlay.
  const resultsInner = (
    <>
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
    </>
  );

  const themeBtn = (active) => ({
    width: 30,
    height: '100%',
    padding: 0,
    borderRadius: 7,
    border: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: active ? 'var(--blue)' : 'var(--tx3)',
    background: active ? 'var(--bg1solid)' : 'transparent',
  });

  return (
    <header
      ref={headerRef}
      style={{
        height: 60,
        flex: '0 0 60px',
        display: 'flex',
        alignItems: 'center',
        gap: isNarrow ? 8 : 16,
        padding: isNarrow ? '0 12px' : '0 22px',
        borderBottom: '1px solid var(--bd)',
        background: 'var(--bg1solid)',
        position: 'relative',
        zIndex: 60,
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
    >
      {onMenuClick && (
        <button type="button" onClick={onMenuClick} aria-label="Open menu" style={{ ...iconBtn, flex: '0 0 auto' }}>
          <Menu size={18} strokeWidth={1.8} style={{ color: 'var(--tx2)' }} />
        </button>
      )}
      <div data-tour="hdr-title" style={{ flex: '0 1 auto', minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: isNarrow ? 15 : 17, letterSpacing: '-.01em', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        {!isNarrow && (
          <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 8 }} />

      {!isNarrow && (
        <button
          type="button"
          onClick={() => navigate('/live-demo')}
          style={{
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 13px',
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,.42)',
            background: 'linear-gradient(135deg,var(--blue),var(--violet))',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            flex: '0 0 auto',
            boxShadow: '0 0 0 1px rgba(255,255,255,.22) inset, 0 0 18px rgba(139,92,246,.58), 0 8px 22px rgba(99,102,241,.28)',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: '#fff',
              boxShadow: '0 0 10px rgba(255,255,255,.95)',
              flex: '0 0 auto',
            }}
          />
          Live Demo
        </button>
      )}

      {/* Server network status — this server's own internet uplink (see
          Sidebar's footer widget, which shows the same reading). Hidden on
          narrower headers, same as the clock/theme controls. */}
      {serverNetworks.length > 0 && !hideNetwork && (
        <div ref={networkRef} data-tour="hdr-network" style={{ position: 'relative', flex: '0 0 auto' }}>
          <div
            onClick={() => setNetworkOpen((o) => !o)}
            title="Server network status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 36,
              padding: '0 12px',
              borderRadius: 9,
              background: 'var(--bg2)',
              border: '1px solid var(--bd)',
              cursor: 'pointer',
            }}
          >
            <span
              className={networkRating !== 'unknown' ? 'vq-glowpulse' : undefined}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: networkColor,
                boxShadow: networkRating !== 'unknown' ? `0 0 8px ${networkColor}` : 'none',
                flex: '0 0 auto',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
              Server network: <span style={{ color: 'var(--tx)', fontWeight: 500 }}>{networkPillLabel}</span>
            </span>
            <ChevronDown
              size={12}
              style={{ color: 'var(--tx3)', flex: '0 0 auto', transform: networkOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
            />
          </div>

          {networkOpen && (
            <div
              className="vq-fadeup"
              style={{
                position: 'absolute',
                top: 44,
                left: 0,
                width: 272,
                background: 'var(--bg1solid)',
                border: '1px solid var(--bd2)',
                borderRadius: 12,
                boxShadow: '0 18px 50px rgba(0,0,0,.6)',
                zIndex: 60,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {serverNetworks.map((network, index) => {
                const { color, label } = networkRatingInfo(network);
                return (
                  <div
                    key={`${network.baseUrl || 'server'}-${index}`}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid var(--bd)',
                      background: 'var(--bg2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flex: '0 0 auto' }} />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--tx3)',
                        fontFamily: 'var(--mono)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: 4,
                      }}
                      title={networkLabelForCard(network)}
                    >
                      {networkLabelForCard(network)}
                    </div>
                    {network.description && (
                      <div style={{ fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 10 }}>
                        {network.description}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 10.5 }}>
                      <div>
                        <div style={{ color: 'var(--tx3)', marginBottom: 2, letterSpacing: '.06em' }}>LATENCY</div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>
                          {network.latency_ms != null ? `${network.latency_ms} ms` : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--tx3)', marginBottom: 2, letterSpacing: '.06em' }}>STATUS</div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'capitalize' }}>
                          {network.status || 'unknown'}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 10, color: 'var(--tx3)' }}>
                      Checked {timeAgo(network.last_checked)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Search — full input on wide screens; on narrow it collapses to an icon
          that opens a full-width search bar below the header. */}
      {isNarrow ? (
        <div ref={searchRef} style={{ flex: '0 0 auto', position: 'relative' }}>
          <button
            type="button"
            onClick={() => {
              const next = !searchOpen;
              setSearchOpen(next);
              if (next) {
                loadCameras();
                setTimeout(() => inputRef.current?.focus(), 0);
              }
            }}
            aria-label="Search"
            style={iconBtn}
          >
            <Search size={17} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
          </button>
          {searchOpen && (
            <div
              className="vq-fadeup"
              style={{ position: 'fixed', top: 60, left: 0, right: 0, padding: 10, background: 'var(--bg1solid)', borderBottom: '1px solid var(--bd)', boxShadow: '0 18px 50px rgba(0,0,0,.35)', zIndex: 70 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--blue)' }}>
                <Search size={15} strokeWidth={1.8} style={{ flex: '0 0 auto', color: 'var(--tx3)' }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchOpen(true);
                    onSearch?.(e.target.value);
                  }}
                  onFocus={onSearchFocus}
                  placeholder="Search cameras and pages…"
                  style={{ fontSize: 13, flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)' }}
                />
              </div>
              {trimmed && (showResults || showNoResults) && (
                <div style={{ marginTop: 8, background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, overflow: 'hidden' }}>
                  {resultsInner}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div ref={searchRef} style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, maxWidth: 280 }}>
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
              placeholder="Search cameras and pages…"
              style={{ fontSize: 12.5, flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)' }}
            />
          </div>

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
              {resultsInner}
            </div>
          )}
        </div>
      )}

      {/* Site switcher */}
      <div ref={siteRef} data-tour="hdr-sites" style={{ position: 'relative', flex: '0 0 auto' }}>
        <div
          onClick={() => setSiteOpen((o) => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 12px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer' }}
        >
          <MapPin size={14} strokeWidth={1.8} style={{ color: 'var(--blue)' }} />
          {!isNarrow && (
            <span style={{ fontSize: 12.5, color: 'var(--tx)', fontWeight: 500, whiteSpace: 'nowrap' }}>{siteFilter}</span>
          )}
          {sites.length > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{sites.length}</span>}
          <ChevronDown size={14} strokeWidth={1.7} style={{ color: 'var(--tx3)' }} />
        </div>
        {siteOpen && (
          <div
            className="vq-fadeup"
            style={{ position: 'absolute', top: 44, right: 0, width: 228, background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.6)', zIndex: 60, padding: 6 }}
          >
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--tx3)', padding: '6px 9px 4px' }}>SWITCH SITE</div>
              <div className="vq-scroll" style={{ maxHeight: 34 * 5, overflowY: 'auto' }}>
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
          </div>
        )}
      </div>

      {/* UTC clock */}
      {!hideClock && (
        <HeaderClock />
      )}

      {/* Theme toggle */}
      {!hideTheme && (
        <div data-tour="hdr-theme" style={{ display: 'flex', gap: 3, height: 36, padding: 3, borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)', flex: '0 0 auto' }} title="Theme">
          <button type="button" aria-label="Light theme" aria-pressed={theme === 'light'} onClick={() => setTheme('light')} style={themeBtn(theme === 'light')}>
            <Sun size={15} strokeWidth={1.8} />
          </button>
          <button type="button" aria-label="Dark theme" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} style={themeBtn(theme === 'dark')}>
            <Moon size={15} strokeWidth={1.8} />
          </button>
        </div>
      )}

      {/* Audio controls */}
      {setAudioEnabled && (
        <div ref={audioRef} style={{ position: 'relative', flex: '0 0 auto' }}>
          <button
            type="button"
            onClick={() => setAudioOpen((o) => !o)}
            aria-label="Audio controls"
            title="Audio controls"
            style={iconBtn}
          >
            {isMuted && lineCrossingMuted ? (
              <VolumeX size={17} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
            ) : (
              <Volume2 size={17} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
            )}
          </button>
          {audioOpen && (
            <div
              className="vq-fadeup"
              style={{ position: 'absolute', top: 44, right: 0, width: 250, background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.5)', zIndex: 70, padding: 8 }}
            >
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--tx3)', padding: '5px 7px 8px' }}>AUDIO CONTROLS</div>
              {[
                {
                  label: 'Live Attendance',
                  muted: !!isMuted,
                  onClick: () => setAudioEnabled?.(!audioEnabled, { successMessage: `Live attendance audio ${audioEnabled ? 'muted' : 'unmuted'}` }),
                },
                {
                  label: 'Line Crossing',
                  muted: lineCrossingMuted,
                  onClick: () => setLineCrossingAudioMuted(!lineCrossingMuted),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  style={{ width: '100%', border: 0, background: 'transparent', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 9, cursor: 'pointer', color: 'var(--tx)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: item.muted ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)', color: item.muted ? '#ef4444' : '#22c55e' }}>
                    {item.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{item.muted ? 'Unmute' : 'Mute'} {item.label}</span>
                    <span style={{ display: 'block', marginTop: 1, fontSize: 10.5, color: 'var(--tx3)' }}>{item.muted ? 'Currently muted' : 'Currently playing'}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overflow menu — holds whatever the header drops on narrow widths
          (clock, network status, theme toggle) so nothing becomes unreachable
          on mobile. */}
      {(hideTheme || hideClock || (hideNetwork && serverNetworks.length > 0)) && (
        <div ref={moreRef} style={{ position: 'relative', flex: '0 0 auto' }}>
          <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-label="Theme and more" title="Theme" style={iconBtn}>
            <SunMoon size={17} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
          </button>
          {moreOpen && (
            <div
              className="vq-fadeup"
              style={{ position: 'absolute', top: 44, right: 0, width: 200, background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.5)', zIndex: 60, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {hideClock && (
                <HeaderClock compact />
              )}
              {hideNetwork && serverNetworks.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span
                    className={networkRating !== 'unknown' ? 'vq-glowpulse' : undefined}
                    style={{ width: 7, height: 7, borderRadius: '50%', background: networkColor, boxShadow: networkRating !== 'unknown' ? `0 0 8px ${networkColor}` : 'none', flex: '0 0 auto' }}
                  />
                  <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>
                    Server network: <span style={{ color: 'var(--tx)', fontWeight: 500 }}>{networkPillLabel}</span>
                  </span>
                </div>
              )}
              {hideTheme && (
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--tx3)', marginBottom: 6 }}>THEME</div>
                  <div style={{ display: 'flex', gap: 3, height: 36, padding: 3, borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
                    <button type="button" aria-label="Light theme" aria-pressed={theme === 'light'} onClick={() => setTheme('light')} style={{ ...themeBtn(theme === 'light'), width: 'auto', flex: 1 }}>
                      <Sun size={15} strokeWidth={1.8} />
                    </button>
                    <button type="button" aria-label="Dark theme" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} style={{ ...themeBtn(theme === 'dark'), width: 'auto', flex: 1 }}>
                      <Moon size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Start a Tour — available to everyone, onboarded or not, so any module
          can be revisited on demand. */}
      <StartTourMenu />

      {/* Notifications */}
      <div ref={notifRef} data-tour="hdr-notifications" style={{ position: 'relative', flex: '0 0 auto' }}>
        <div
          onClick={() => setNotifOpen((o) => !o)}
          role="button"
          aria-label="Notifications"
          title={notifications.length > 0 ? `Notifications — ${notifications.length} new` : 'Notifications'}
          style={{ ...iconBtn, position: 'relative' }}
        >
          <Bell size={17} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
          {unreadNum > 0 && (
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
              {unreadNum}
            </span>
          )}
        </div>
        {notifOpen && (
          <div
            className="vq-fadeup"
            style={{ position: 'absolute', top: 44, right: 0, width: 332, maxWidth: '86vw', background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.6)', zIndex: 60, overflow: 'hidden' }}
          >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--bd)' }}>
                <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5 }}>Notifications</span>
                {unreadNum > 0 && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#fff', background: 'var(--crit)', borderRadius: 8, padding: '1px 7px' }}>
                    {unreadNum} new
                  </span>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onMarkNotificationsRead?.(notifications.map((n) => n.id))}
                    style={{ marginLeft: 'auto', background: 'none', border: 0, cursor: 'pointer', fontSize: 11, color: 'var(--blue)', padding: 0 }}
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="vq-scroll" style={{ maxHeight: 332, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 22, textAlign: 'center', fontSize: 12, color: 'var(--tx3)' }}>You're all caught up</div>
                ) : (
                  notifications.map((n, i) => (
                    <div
                      key={n.id || i}
                      onClick={() => {
                        onMarkNotificationsRead?.([n.id]);
                        n.go?.();
                      }}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--bd)', cursor: 'pointer', background: n.read ? 'transparent' : 'var(--bg2)' }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.read ? 'var(--bd2)' : (n.sevColor || 'var(--warn)'), boxShadow: n.read ? 'none' : `0 0 7px ${n.sevColor || 'var(--warn)'}`, flex: '0 0 auto', marginTop: 5 }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 12.5, fontWeight: n.read ? 400 : 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{[n.cam, n.time].filter(Boolean).join(' · ')}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div
                onClick={() => {
                  setNotifOpen(false);
                  navigate('/alerts');
                }}
                style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, fontWeight: 500, color: 'var(--blue)', borderTop: '1px solid var(--bd)', cursor: 'pointer' }}
              >
                View all alerts
              </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default memo(Header);

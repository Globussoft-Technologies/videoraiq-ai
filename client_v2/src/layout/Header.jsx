import { useState } from 'react';
import { Search, MapPin, Bell, Sun, Moon, ChevronDown } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useClock } from '../hooks/useClock';

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
  const [siteOpen, setSiteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState('');

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
            border: '1px solid var(--bd)',
            color: 'var(--tx3)',
            overflow: 'hidden',
          }}
        >
          <Search size={15} strokeWidth={1.8} style={{ flex: '0 0 auto' }} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearch?.(e.target.value);
            }}
            placeholder="Search cameras, events, plates…"
            style={{ fontSize: 12.5, flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)' }}
          />
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', border: '1px solid var(--bd)', borderRadius: 4, padding: '1px 5px', flex: '0 0 auto' }}>
            ⌘K
          </span>
        </div>
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

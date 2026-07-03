import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { NAV_GROUPS } from './nav.config';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/theme/ThemeContext';
import { getSidebarConfig } from '../helpers/dashboard';
import { useApi } from '../hooks/useApi';
import videoraiqLogoColor from '@/assets/videoraiq-logo-color.png';
import videoraiqLogoWhite from '@/assets/videoraiq-logo-white.png';

const navItemStyle = (active, collapsed) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: collapsed ? 'center' : 'flex-start',
  gap: collapsed ? 0 : 11,
  padding: collapsed ? '10px 0' : '9px 11px',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'var(--ui)',
  fontWeight: active ? 600 : 500,
  fontSize: 13,
  letterSpacing: '.01em',
  textDecoration: 'none',
  color: active ? 'var(--blue)' : 'var(--tx2)',
  background: active
    ? 'linear-gradient(90deg,rgba(59,130,246,.16),rgba(168,85,247,.07))'
    : 'transparent',
  boxShadow: active ? 'inset 0 0 0 1px rgba(59,130,246,.45)' : 'none',
  transition: 'background .15s,color .15s',
  position: 'relative',
});

function groupLabelStyle() {
  return {
    fontSize: 9.5,
    color: 'var(--tx3)',
    letterSpacing: '.16em',
    padding: '14px 10px 6px',
    fontFamily: 'var(--mono)',
  };
}

const STORAGE_KEY = 'vq-sidebar-collapsed';

export default function Sidebar({ badges = {} }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (next) setAccountOpen(false);
      return next;
    });
  };

  // Engine status footer — real count from the dashboard sidebar config.
  const { data: cfg } = useApi(getSidebarConfig, []);
  const configs = cfg?.detectionConfigs || [];
  const enabledCount = configs.filter((c) => c.isEnabled).length;
  const totalCount = configs.length;

  const name = user?.user_name || user?.name || user?.user_email?.split('@')[0] || 'User';
  const email = user?.user_email || '';
  const initials =
    name
      .split(' ')
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'VQ';

  return (
    <aside
      style={{
        width: collapsed ? 74 : 250,
        flex: collapsed ? '0 0 74px' : '0 0 250px',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--glass)',
        backdropFilter: 'blur(14px)',
        borderRight: '1px solid var(--bd)',
        padding: collapsed ? '18px 10px' : '18px 14px',
        gap: 6,
        position: 'relative',
        zIndex: 60,
        transition: 'width .2s ease, padding .2s ease',
      }}
    >
      {/* Logo + collapse toggle */}
      <div
        style={{
          flex: '0 0 auto',
          padding: collapsed ? '4px 0 14px' : '4px 8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
        }}
      >
        {!collapsed && (
          <img
            src={theme === 'dark' ? videoraiqLogoWhite : videoraiqLogoColor}
            alt="VideoraIQ"
            style={{
              maxWidth: '100%',
              height: 34,
              objectFit: 'contain',
              objectPosition: 'left center',
            }}
          />
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 8,
            border: '1px solid var(--bd)',
            background: 'var(--bg2)',
            color: 'var(--tx2)',
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <div
        className="vq-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          margin: '0 -4px',
          padding: '0 4px 6px',
        }}
      >
        {NAV_GROUPS.filter((g) => !g.hidden).map((group, gi) => (
          <div key={group.label} style={{ display: 'contents' }}>
            {collapsed ? (
              gi !== 0 && (
                <div style={{ height: 1, background: 'var(--bd)', margin: '10px 6px 4px' }} />
              )
            ) : (
              <div style={{ ...groupLabelStyle(), paddingTop: gi === 0 ? 2 : 14 }}>{group.label}</div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const badge = item.badgeKey ? badges[item.badgeKey] : null;
              return (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={item.end}
                  title={collapsed ? item.label : undefined}
                  style={({ isActive }) => navItemStyle(isActive, collapsed)}
                >
                  <Icon size={18} strokeWidth={1.7} />
                  {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                  {badge != null && badge > 0 &&
                    (collapsed ? (
                      <span
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 12,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--crit)',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#fff',
                          background: 'var(--crit)',
                          padding: '1px 6px',
                          borderRadius: 8,
                        }}
                      >
                        {badge}
                      </span>
                    ))}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer: engine status + account */}
      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {totalCount > 0 && !collapsed && (
          <div
            style={{
              padding: '11px 12px',
              borderRadius: 11,
              background: 'linear-gradient(135deg,rgba(59,130,246,.12),rgba(168,85,247,.07))',
              border: '1px solid var(--bd)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <span
                className="vq-glowpulse"
                style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--tx2)' }}>
                {enabledCount} of {totalCount} detections live
              </span>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {configs.map((c, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: c.isEnabled ? 'var(--ok)' : 'var(--toggleoff)',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setAccountOpen((o) => !o)}
            title={collapsed ? name : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 10,
              padding: '6px 8px',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                flex: '0 0 auto',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              }}
            >
              {initials}
            </span>
            {!collapsed && (
              <>
                <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>Security Admin</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="1.7">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </>
            )}
          </div>

          {accountOpen && (
            <>
              <div onClick={() => setAccountOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 65 }} />
              <div
                className="vq-fadeup"
                style={{
                  position: 'absolute',
                  bottom: 52,
                  left: 0,
                  width: collapsed ? 220 : 'auto',
                  right: collapsed ? 'auto' : 0,
                  background: 'var(--bg1solid)',
                  border: '1px solid var(--bd2)',
                  borderRadius: 13,
                  boxShadow: '0 18px 50px rgba(0,0,0,.6)',
                  zIndex: 70,
                  padding: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 9px 11px', borderBottom: '1px solid var(--bd)', marginBottom: 5 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#fff',
                      background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                    }}
                  >
                    {initials}
                  </span>
                  <div style={{ lineHeight: 1.25, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {email}
                    </div>
                  </div>
                </div>
                {[
                  { label: 'My Profile', hint: 'Account & activity', to: 'profile' },
                  { label: 'Settings', hint: 'Platform configuration', to: 'settings' },
                ].map((m) => (
                  <div
                    key={m.to}
                    onClick={() => {
                      setAccountOpen(false);
                      navigate(m.to);
                    }}
                    style={{ display: 'flex', flexDirection: 'column', padding: '8px 9px', borderRadius: 9, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{m.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{m.hint}</span>
                  </div>
                ))}
                <div
                  onClick={() => navigate('/logout')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 5,
                    padding: 9,
                    borderRadius: 9,
                    cursor: 'pointer',
                    color: 'var(--crit)',
                    borderTop: '1px solid var(--bd)',
                  }}
                >
                  <LogOut size={15} strokeWidth={1.8} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>Sign Out</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

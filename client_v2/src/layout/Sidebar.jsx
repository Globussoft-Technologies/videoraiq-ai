import { useState, useRef, useCallback, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { LogOut, ChevronsLeft, ChevronsRight, X, ChevronDown, GripVertical } from 'lucide-react';
import { NAV_GROUPS, LOGS_GROUP_LABEL } from './nav.config';
import { useLogOrder, orderLogItems, moveLogItem } from '@/lib/logOrder';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionContext';
import { useLogsConfig } from '@/context/LogsConfigContext';
import { useTheme } from '@/theme/ThemeContext';
import { ENGINE_PALETTE } from '@/lib/engineMeta';
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
    // Use --tx2 (not the dimmer --tx3) so section headers stay legible against
    // the near-black sidebar background in dark theme.
    color: 'var(--tx2)',
    letterSpacing: '.16em',
    padding: '14px 10px 6px',
    fontFamily: 'var(--mono)',
  };
}

const STORAGE_KEY = 'vq-sidebar-collapsed';

// Same rule as V1's Header.jsx navLinks.filter(): while permissions haven't
// loaded yet (empty object) show everything, so the sidebar doesn't flash
// empty on first render; once loaded, an item with a permissionKey needs
// permissions[key]?.view === true to appear at all — hidden, not disabled.
function isItemVisible(item, permissions) {
  if (!item.permissionKey) return true;
  if (!permissions || Object.keys(permissions).length === 0) return true;
  if (item.permissionSubKey) {
    const module = permissions?.[item.permissionKey];
    if (module?.[item.permissionSubKey]?.view === true) return true;
    if (module?.global?.view === true) return true;
    if (module?.view === true) return true;
    return false;
  }
  return permissions?.[item.permissionKey]?.view === true;
}

/**
 * Log & record pages follow GET /logs-configuration, which already accounts for
 * the admin's own preference, auto-enable, and the detection licence.
 *
 * Fails open, and for the same reason as the permission filter above: while the
 * config is loading — or if the request failed — show the item. Hiding pages
 * first and revealing them later reads as the sidebar losing them, and a failed
 * fetch must never strip a client of navigation they are entitled to.
 */
function isItemLogEnabled(item, logsConfig) {
  if (!item.logsConfigKey) return true;
  if (!logsConfig) return true;
  return logsConfig[item.logsConfigKey] !== false;
}

const LOGS_COLLAPSE_KEY = 'vq-sidebar-logs-collapsed';

export default function Sidebar({ badges = {}, isMobile = false, mobileOpen = false, onMobileClose, camHealth = null }) {
  const { user } = useAuth();
  const { permissions } = usePermissions();
  const { logs: logsConfig } = useLogsConfig();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  // User's own LOGS & RECORDS ordering (Settings ▸ Log Order toggle). Resyncs
  // live, including across tabs. While `enabled` is false the items below
  // aren't draggable and orderLogItems() is a no-op.
  const logOrder = useLogOrder();
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const [logsHeaderHover, setLogsHeaderHover] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const accountRef = useRef(null);
  // Close the account menu on an outside click / Escape (replaces the
  // fixed-overlay backdrop, which is trapped inside the sidebar's
  // backdrop-filter box and so never covers the rest of the page).
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  useOutsideClick(accountRef, accountOpen, closeAccount);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  // In the mobile drawer the sidebar is always fully expanded (labels visible);
  // the collapse feature only applies to the docked desktop sidebar.
  const collapsed = isMobile ? false : desktopCollapsed;

  const [logsCollapsed, setLogsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LOGS_COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  // Landing directly on a logs route (fresh load, or a link from elsewhere)
  // should reveal its own active link — but only as a one-time nudge, so it
  // doesn't fight the user's own collapse click on every re-render while they
  // stay within logs/* pages.
  const onLogsRoute = location.pathname.includes('/logs/');
  useEffect(() => {
    if (onLogsRoute) setLogsCollapsed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLogsRoute]);
  const logsExpanded = !logsCollapsed;
  const toggleLogsCollapsed = () => {
    setLogsCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(LOGS_COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleCollapsed = () => {
    setDesktopCollapsed((c) => {
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

  // Camera health footer — the same tally Command Center's "Cameras Online" KPI
  // shows, passed down from V2Layout. Measuring it here would mean opening a
  // stream per camera on every page. (`control` is "has a detection enabled",
  // not "is live", so it can't be used for this.)
  const onlineCount = camHealth?.online ?? 0;
  const totalCount = camHealth?.total ?? 0;
  // Green for online cameras; the dot greys out only when none are up.
  const healthColor = onlineCount > 0 ? 'var(--ok)' : 'var(--toggleoff)';

  const name = user?.user_name || user?.name || user?.user_email?.split('@')[0] || 'User';
  const email = user?.user_email || '';
  // Sub-user tokens always carry a roleId (populated from authorizedUsers'
  // roleIds ref, even though the backend's populate select currently has a
  // stale field name and never resolves an actual name); the real admin's own
  // token has no roleId at all. Use that presence/absence to tell them apart
  // since neither token carries a real "Admin"/role-name string today.
  const roleTitle = user?.roleId?.roleName || user?.roleIds?.roleName || user?.role || user?.roleName
    || (user?.roleId ? 'User' : 'Security Admin');
  const isAdmin = !user?.memberId;
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
      style={
        isMobile
          ? {
              width: 260,
              maxWidth: '82vw',
              flex: '0 0 auto',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg1solid)',
              borderRight: '1px solid var(--bd)',
              padding: '18px 14px',
              gap: 6,
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              height: '100vh',
              zIndex: 80,
              transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform .25s ease',
              boxShadow: mobileOpen ? '0 0 40px rgba(0,0,0,.4)' : 'none',
            }
          : {
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
            }
      }
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
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
            <span
              style={{
                marginTop: 7,
                fontFamily: 'var(--mono)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.08em',
                color: 'var(--tx3)',
                lineHeight: 1,
              }}
            >
              Version 2.0.0
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={isMobile ? onMobileClose : toggleCollapsed}
          title={isMobile ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isMobile ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
          {isMobile ? <X size={16} /> : collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
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
        {NAV_GROUPS
          .filter((g) => !g.hidden)
          .map((group) => ({
            ...group,
            items: group.items.filter(
              (item) => isItemVisible(item, permissions) && isItemLogEnabled(item, logsConfig),
            ),
          }))
          // After the permission filter, so a hidden log never leaves a gap.
          .map((group) => (group.label === LOGS_GROUP_LABEL
            ? { ...group, items: orderLogItems(group.items, logOrder) }
            : group))
          .filter((group) => group.items.length > 0)
          .map((group, gi) => (
          <div key={group.label} style={{ display: 'contents' }}>
            {collapsed ? (
              gi !== 0 && (
                <div style={{ height: 1, background: 'var(--bd)', margin: '10px 6px 4px' }} />
              )
            ) : group.label === LOGS_GROUP_LABEL ? (
              <div
                onClick={toggleLogsCollapsed}
                title={logsExpanded ? 'Collapse' : 'Expand'}
                onMouseEnter={() => setLogsHeaderHover(true)}
                onMouseLeave={() => setLogsHeaderHover(false)}
                style={{
                  marginTop: gi === 0 ? 2 : 12,
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 10px 8px 8px', borderRadius: 8,
                  borderTop: `1px solid ${logsHeaderHover ? 'var(--bd2)' : 'var(--bd)'}`,
                  borderRight: `1px solid ${logsHeaderHover ? 'var(--bd2)' : 'var(--bd)'}`,
                  borderBottom: `1px solid ${logsHeaderHover ? 'var(--bd2)' : 'var(--bd)'}`,
                  borderLeft: `3px solid ${onLogsRoute ? 'var(--blue)' : (logsHeaderHover ? 'var(--bd2)' : 'var(--bd)')}`,
                  background: logsHeaderHover ? 'var(--bg2)' : 'transparent',
                  cursor: 'pointer', userSelect: 'none', transition: 'background .12s,border-color .12s',
                }}
              >
                <ChevronDown
                  size={13}
                  style={{
                    color: 'var(--tx2)', flexShrink: 0,
                    transform: logsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                    transition: 'transform .15s',
                  }}
                />
                <span style={{
                  flex: 1, fontSize: 9.5, letterSpacing: '.14em', fontFamily: 'var(--mono)', fontWeight: 600,
                  color: 'var(--tx2)',
                }}>
                  {group.label}
                </span>
                {onLogsRoute && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />
                )}
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600, color: 'var(--tx3)',
                  background: 'var(--bg2)', borderRadius: 5, padding: '2px 6px',
                }}>
                  {group.items.length}
                </span>
              </div>
            ) : (
              <div style={{ ...groupLabelStyle(), paddingTop: gi === 0 ? 2 : 14 }}>{group.label}</div>
            )}
            {(group.label !== LOGS_GROUP_LABEL || logsExpanded || collapsed) && group.items.map((item) => {
              const Icon = item.icon;
              const badge = item.badgeKey ? badges[item.badgeKey] : null;
              // Reordering (Settings ▸ Log Order toggle) only applies to the
              // logs group, and only expanded — collapsed mode is icon-only
              // and dragging those isn't worth the fumbling.
              const draggableHere = group.label === LOGS_GROUP_LABEL && logOrder.enabled && !collapsed;
              const isDragging = draggableHere && dragKey === item.key;
              const isDropTarget = draggableHere && overKey === item.key && dragKey && dragKey !== item.key;
              return (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={item.end}
                  title={collapsed ? item.label : undefined}
                  draggable={draggableHere}
                  onDragStart={draggableHere ? (e) => {
                    // A dragged NavLink otherwise triggers browser link-drag
                    // (drops a URL), not a reorder — suppress that so this
                    // reads as a list reorder instead.
                    e.dataTransfer.effectAllowed = 'move';
                    setDragKey(item.key);
                  } : undefined}
                  onDragEnd={draggableHere ? () => { setDragKey(null); setOverKey(null); } : undefined}
                  onDragOver={draggableHere ? (e) => { e.preventDefault(); setOverKey(item.key); } : undefined}
                  onDragLeave={draggableHere ? () => setOverKey((k) => (k === item.key ? null : k)) : undefined}
                  onDrop={draggableHere ? (e) => {
                    e.preventDefault();
                    moveLogItem(logOrder.order, dragKey, item.key);
                    setDragKey(null);
                    setOverKey(null);
                  } : undefined}
                  onClick={(event) => {
                    if (item.path === 'detection-settings') {
                      event.preventDefault();
                      navigate('/detection-settings');
                    }
                    if (isMobile) onMobileClose?.();
                  }}
                  style={({ isActive }) => ({
                    ...navItemStyle(isActive, collapsed),
                    ...(draggableHere ? { cursor: 'grab' } : null),
                    ...(isDragging ? { opacity: 0.5 } : null),
                    ...(isDropTarget ? { boxShadow: 'inset 0 2px 0 var(--blue)' } : null),
                  })}
                >
                  {draggableHere && <GripVertical size={13} style={{ color: 'var(--tx3)', flexShrink: 0, marginRight: -3 }} />}
                  <Icon size={18} strokeWidth={1.7} />
                  {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 9,
                        fontWeight: 800,
                        color: '#fff',
                        background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                        padding: '2px 6px',
                        borderRadius: 7,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
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
                className={onlineCount > 0 ? 'vq-glowpulse' : undefined}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: healthColor,
                  boxShadow: onlineCount > 0 ? `0 0 8px ${healthColor}` : 'none',
                  transition: 'background .3s ease',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--tx2)' }}>
                {onlineCount} of {totalCount} {totalCount === 1 ? 'camera' : 'cameras'} online ({totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0}%)
              </span>
            </div>
            {/* Single continuous progress bar representing the percentage of online cameras */}
            <div
              style={{
                width: '100%',
                height: 4,
                borderRadius: 2,
                background: 'var(--toggleoff)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0}%`,
                  background: 'linear-gradient(90deg, var(--blue), var(--violet))',
                  borderRadius: 2,
                  transition: 'width .3s ease',
                }}
              />
            </div>
          </div>
        )}

        <div ref={accountRef} style={{ position: 'relative' }}>
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
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{roleTitle}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="1.7">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </>
            )}
          </div>

          {accountOpen && (
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
                {!isAdmin && <div
                  onClick={() => { setAccountOpen(false); navigate('/profile'); }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: 9, borderRadius: 9, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>My Profile</span>
                  <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>View </span>
                </div>}
                {isAdmin && <div
                  onClick={() => { setAccountOpen(false); navigate('/admin-profile'); }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: 9, borderRadius: 9, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>My Profile</span>
                  <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>View profile   details</span>
                </div>}
                <div
                  onClick={() => { setAccountOpen(false); setShowLogoutConfirm(true); }}
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
          )}
        </div>
      </div>

      {showLogoutConfirm && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(2, 6, 23, .62)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              width: 'min(100%, 380px)',
              padding: 24,
              borderRadius: 16,
              background: 'var(--bg1solid)',
              border: '1px solid var(--bd2)',
              boxShadow: '0 20px 60px rgba(0,0,0,.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,.12)', color: 'var(--crit)' }}>
                <LogOut size={18} />
              </span>
              <h2 id="logout-confirm-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--tx)' }}>
                Confirm sign out
              </h2>
            </div>
            <p style={{ margin: '0 0 22px', fontSize: 13, lineHeight: 1.5, color: 'var(--tx2)' }}>
              Are you sure you want to sign out of your account?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowLogoutConfirm(false); navigate('/logout'); }}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--crit)', background: 'var(--crit)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </aside>
  );
}

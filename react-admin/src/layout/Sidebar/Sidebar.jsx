import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import Cookies from 'js-cookie'
import {
  LayoutGrid,
  Building2,
  ScanEye,
  CreditCard,
  Menu,
  Shield,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { useTheme } from '../../context/ThemeContext'
import { getAuthUser, getInitials, clearAuthUser } from '../../utils/authUser'
import logoWhite from '../../assets/videoraiq-logo-white.png'
import logoColor from '../../assets/videoraiq-logo-color.png'
import logoMark from '../../assets/videoraiq-circle-white.png'

const NAV = [
  { to: '/fleet', label: 'Fleet Overview', Icon: LayoutGrid },
  { to: '/clients', label: 'Clients', Icon: Building2, badge: 6 },
  { to: '/detection-catalog', label: 'Detection Catalog', Icon: ScanEye },
  { to: '/subscription-plans', label: 'Subscription Plans', Icon: CreditCard },
  { to: '/feature-roadmap', label: 'Feature Roadmap', Icon: Menu },
]

const Sidebar = () => {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const user = getAuthUser()
  const name = user?.name || 'Super Admin'
  const email = user?.email || ''

  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const menuRef = useRef(null)

  // Close the profile dropdown when clicking outside of it.
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const handleLogout = () => {
    Cookies.remove('access-token')
    clearAuthUser()
    setMenuOpen(false)
    navigate('/login', { replace: true })
  }

  // Theme-aware full logo (color in light mode, white in dark mode).
  const brandLogo = theme === 'dark' ? logoWhite : logoColor

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-200 dark:border-white/8 dark:bg-[#0b0d13] ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand + collapse toggle — stacks vertically when collapsed so the
          toggle always stays inside the sidebar. */}
      <div
        className={`px-4 pt-5 pb-4 ${
          collapsed ? 'flex flex-col items-center gap-3' : 'flex items-center justify-between'
        }`}
      >
        {collapsed ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-purple-600 shadow-sm">
            <img src={logoMark} alt="VideoraIQ" className="h-6 w-6 object-contain" />
          </span>
        ) : (
          <img src={brandLogo} alt="VideoraIQ" className="h-8 w-auto object-contain" />
        )}

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/8 dark:hover:text-gray-200"
        >
          {collapsed ? <PanelLeftOpen size={18} strokeWidth={2} /> : <PanelLeftClose size={18} strokeWidth={2} />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 pb-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-300/60 bg-purple-50 px-2.5 py-1 dark:border-purple-400/30 dark:bg-purple-500/10">
            <Shield size={11} strokeWidth={2.4} className="text-purple-500 dark:text-purple-300" />
            <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-purple-600 dark:text-purple-300">
              SUPER ADMIN
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {!collapsed && (
          <p className="px-2 pb-2 font-mono text-[10px] font-semibold tracking-[0.18em] text-gray-400 dark:text-gray-600">
            PLATFORM
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, Icon, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-purple-50 text-purple-700 dark:bg-white/8 dark:text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/4 dark:hover:text-gray-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      strokeWidth={2}
                      className={`shrink-0 ${
                        isActive
                          ? 'text-purple-600 dark:text-purple-300'
                          : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
                      }`}
                    />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{label}</span>
                        {badge != null && (
                          <span
                            className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                              isActive
                                ? 'bg-purple-200 text-purple-800 dark:bg-white/15 dark:text-white'
                                : 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400'
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer: theme toggle + profile */}
      <div className="border-t border-gray-200 px-3 py-3 dark:border-white/8">
        {!collapsed && <ThemeToggle />}

        <div className="relative mt-3" ref={menuRef}>
          {/* Profile trigger row */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/4 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-purple-500 to-fuchsia-500 text-sm font-semibold text-white">
              {getInitials(name)}
            </span>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name}</p>
                  <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                    {email || 'Super Administrator'}
                  </p>
                </div>
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  className={`shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${
                    menuOpen ? 'rotate-180' : ''
                  }`}
                />
              </>
            )}
          </button>

          {/* Dropdown card (opens upward) */}
          {menuOpen && (
            <div
              role="menu"
              className={`absolute bottom-full mb-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#12151d] ${
                collapsed ? 'left-0 w-56' : 'inset-x-0'
              }`}
            >
              {/* Header: user details */}
              <div className="flex items-center gap-3 px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-purple-500 to-fuchsia-500 text-sm font-semibold text-white">
                  {getInitials(name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name}</p>
                  <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                    {email || 'Super Administrator'}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-white/6" />

              {/* Sign out */}
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <LogOut size={16} strokeWidth={2.2} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar

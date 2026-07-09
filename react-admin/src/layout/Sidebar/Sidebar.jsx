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
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { getAuthUser, getInitials, clearAuthUser } from '../../utils/authUser'
import videoraiqCircle from '../../assets/videoraiq-circle-white.png'

const NAV = [
  { to: '/fleet', label: 'Fleet Overview', Icon: LayoutGrid },
  { to: '/clients', label: 'Clients', Icon: Building2, badge: 6 },
  { to: '/detection-catalog', label: 'Detection Catalog', Icon: ScanEye },
  { to: '/subscription-plans', label: 'Subscription Plans', Icon: CreditCard },
  { to: '/feature-roadmap', label: 'Feature Roadmap', Icon: Menu },
]

const Sidebar = () => {
  const navigate = useNavigate()
  const user = getAuthUser()
  const name = user?.name || 'Super Admin'
  const email = user?.email || ''

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close the dropdown when clicking outside of it.
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

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-white/8 dark:bg-[#0b0d13]">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-sm">
            <img src={videoraiqCircle} alt="" className="h-6 w-6 object-contain" />
          </span>
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
            Videora<span className="text-purple-500">IQ</span>
          </span>
        </div>

        <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-purple-300/60 bg-purple-50 px-2.5 py-1 dark:border-purple-400/30 dark:bg-purple-500/10">
          <Shield size={11} strokeWidth={2.4} className="text-purple-500 dark:text-purple-300" />
          <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-purple-600 dark:text-purple-300">
            SUPER ADMIN
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-2 pb-2 font-mono text-[10px] font-semibold tracking-[0.18em] text-gray-400 dark:text-gray-600">
          PLATFORM
        </p>
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, Icon, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
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
                      className={
                        isActive
                          ? 'text-purple-600 dark:text-purple-300'
                          : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
                      }
                    />
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
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer: theme toggle + profile */}
      <div className="border-t border-gray-200 px-3 py-3 dark:border-white/8">
        <ThemeToggle />

        <div className="relative mt-3" ref={menuRef}>
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-purple-500 to-fuchsia-500 text-sm font-semibold text-white">
              {getInitials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {name}
              </p>
              <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                {email || 'Super Administrator'}
              </p>
            </div>

            {/* Logout menu trigger */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/8 dark:hover:text-gray-200"
            >
              <LogOut size={16} strokeWidth={2} />
            </button>
          </div>

          {/* Dropdown (opens upward, footer sits at screen bottom) */}
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 bottom-full mb-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#12151d]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <LogOut size={16} strokeWidth={2} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar

// Persists the signed-in user's display data (name/email) so the sidebar
// can show it after a page refresh. The auth token itself stays in the cookie.
const STORAGE_KEY = 'auth-user'

export const CLIENT_AVATAR_COLORS = [
  'from-blue-500 to-purple-500',
  'from-purple-500 to-pink-500',
  'from-teal-400 to-cyan-500',
  'from-pink-500 to-rose-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-green-500',
]

export const setAuthUser = (user) => {
  if (!user) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  } catch {
    // ignore storage errors (e.g. private mode / quota)
  }
}

export const getAuthUser = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const user = raw ? JSON.parse(raw) : null
    if (!user || typeof user !== 'object' || Array.isArray(user)) return null
    if (['name', 'email'].some((field) => user[field] != null && typeof user[field] !== 'string')) return null
    return user
  } catch {
    return null
  }
}

export const clearAuthUser = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

// Build avatar initials from a name: "John Doe" -> "JD", "John" -> "JO".
export const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'SA'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

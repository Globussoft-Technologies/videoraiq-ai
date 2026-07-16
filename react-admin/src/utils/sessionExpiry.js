import Cookies from 'js-cookie'
import { clearAuthUser } from './authUser'

// A batch of requests can fail at once (see the Fleet page firing 3+ calls),
// so guard against logging out / redirecting more than once.
let handling = false

// Clear the session and send the user back to login. Called when the API
// reports the token is invalid/expired (session over). Silent — no message,
// the user just lands on the login page and signs in again.
export const handleSessionExpiry = () => {
  if (handling) return
  handling = true

  Cookies.remove('access-token', { path: '/' })
  clearAuthUser()

  // Already on login (e.g. a bad login attempt)? Leave that flow alone.
  if (!window.location.pathname.startsWith('/login')) {
    // Full redirect clears any in-memory state from the expired session.
    window.location.assign('/login')
  }

  // Let a fresh login re-arm the guard on the next page load.
  setTimeout(() => {
    handling = false
  }, 3000)
}

import axios from 'axios'
import { handleSessionExpiry } from './sessionExpiry'

// Messages the backend returns when the token is invalid/expired. It sends
// these as HTTP 400 (not 401), so we match on the message too — not status alone.
const TOKEN_ERROR_MESSAGES = [
  'invalid access token',
  'access token is required',
  'token expired',
  'jwt expired',
  'unauthorized',
]

const isTokenError = (error) => {
  const status = error?.response?.status
  if (status === 401 || status === 403) return true

  const body = error?.response?.data
  const message =
    typeof body === 'object' ? body?.body?.message || body?.message : undefined
  if (!message) return false
  return TOKEN_ERROR_MESSAGES.includes(String(message).trim().toLowerCase())
}

// Install a global response interceptor: any request whose failure means the
// session is over triggers a clean logout instead of surfacing the raw error.
export const setupAxiosInterceptors = () => {
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (isTokenError(error)) {
        handleSessionExpiry()
      }
      return Promise.reject(error)
    }
  )
}

import { toast } from 'react-toastify'

// The API wraps responses as { statusCode, body: { status, message, data } },
// so error messages live at err.response.data.body.message. Older/other shapes
// put it at err.response.data.message. Check both, then fall back.
export const getApiMessage = (err, fallback = 'Something went wrong') => {
  const status = err?.response?.status

  // Gateway / server-down statuses return HTML (not our JSON envelope), so a
  // clear, actionable message beats the raw "Network Error" / Cloudflare page.
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is temporarily unavailable. Please try again in a moment.'
  }
  if (!err?.response && err?.message === 'Network Error') {
    return 'Unable to reach the server. Check your connection and try again.'
  }

  const data = err?.response?.data
  // Cloudflare error pages come back as an HTML string in data — don't show that.
  const bodyMessage = typeof data === 'object' ? data?.body?.message || data?.message : null
  return bodyMessage || err?.message || fallback
}

// Show the API's error message in a toast. Returns the resolved message
// so callers can also use it for inline state if they want.
export const notifyApiError = (err, fallback) => {
  const message = getApiMessage(err, fallback)
  toast.error(message)
  return message
}

// Pull the success message straight out of a response (same envelope shape),
// so we surface what the server actually says instead of a hardcoded string.
export const getApiSuccess = (res, fallback = 'Success') => {
  const data = res?.data ?? res
  return data?.body?.message || data?.message || fallback
}

// Show the API's success message in a toast. `res` is the raw axios response
// (or its .data). Returns the resolved message.
export const notifyApiSuccess = (res, fallback) => {
  const message = getApiSuccess(res, fallback)
  toast.success(message)
  return message
}

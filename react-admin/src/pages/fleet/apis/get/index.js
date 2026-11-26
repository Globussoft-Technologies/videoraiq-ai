import axios from 'axios'
import { waitForToken } from '../../../../utils/waitForToken'

const apiUrl = import.meta.env.VITE_BACKEND

const authGet = async (path) => {
  const token = await waitForToken()
  const response = await axios.get(`${apiUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  })
  if (response.data?.body?.status === 'failed') {
    throw new Error(response.data.body.message || 'Failed to load fleet data')
  }
  return response.data
}

// Header tiles, camera utilisation per client, clients by plan,
// detections by type, camera health.
export const getFleetOverview = (search = '', asOf = '', status = 'active') => {
  const params = new URLSearchParams()
  if (search.trim()) params.set('search', search.trim())
  if (asOf) params.set('asOf', asOf)
  if (status !== 'active') params.set('status', status)
  const query = params.toString()
  return authGet(`/api/v1/client/overview${query ? `?${query}` : ''}`)
}

// Clients ranked by incident (alert) count. hours: default 24, max 720.
export const getTopAlerts = (hours = 24, limit = 5, asOf = '', search = '', status = 'active') =>
  authGet(`/api/v1/client/top-alerts?${new URLSearchParams({ hours, limit, ...(asOf ? { asOf } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(status !== 'active' ? { status } : {}) })}`)

// Fleet-wide hourly incident counts, zero-filled. hours: default 24, max 168.
export const getAlertsGraph = (hours = 24, asOf = '', search = '', status = 'active') =>
  authGet(`/api/v1/client/alerts-graph?${new URLSearchParams({ hours, ...(asOf ? { asOf } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(status !== 'active' ? { status } : {}) })}`)

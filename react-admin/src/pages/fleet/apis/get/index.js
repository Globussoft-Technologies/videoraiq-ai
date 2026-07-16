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
  return response.data
}

// Header tiles, camera utilisation per client, clients by plan,
// detections by type, camera health.
export const getFleetOverview = () => authGet('/api/v1/client/overview')

// Clients ranked by incident (alert) count. hours: default 24, max 720.
export const getTopAlerts = (hours = 24, limit = 5) =>
  authGet(`/api/v1/client/top-alerts?hours=${hours}&limit=${limit}`)

// Fleet-wide hourly incident counts, zero-filled. hours: default 24, max 168.
export const getAlertsGraph = (hours = 24) =>
  authGet(`/api/v1/client/alerts-graph?hours=${hours}`)

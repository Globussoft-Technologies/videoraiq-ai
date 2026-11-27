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

export const getFleetMetricDetails = (metric, { skip, limit, search, setup }) =>
  authGet(`/api/v1/client/overview/${metric}?${new URLSearchParams({ skip, limit, search, ...(setup ? { setup } : {}) })}`)

// Header tiles, camera utilisation per client, clients by plan,
// detections by type, camera health.
export const getFleetOverview = (search = '') =>
  authGet(`/api/v1/client/overview?${new URLSearchParams({ search, includeAlerts: 'false' })}`)

export const getTopActiveAlertClients = (search) =>
  authGet(`/api/v1/client/top-alerts?${new URLSearchParams({ hours: 24, limit: 5, status: 'active', search })}`)

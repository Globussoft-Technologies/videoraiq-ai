import axios from 'axios'
import { waitForToken } from '../../utils/waitForToken'

export async function getMonitoringCameras(adminId, params, signal) {
  const token = await waitForToken()
  const response = await axios.get(
    `${import.meta.env.VITE_BACKEND}/api/v1/stream-monitoring/admins/${encodeURIComponent(adminId)}/cameras`,
    { params, signal, headers: { 'x-access-token': token } },
  )
  const data = response.data
  if (data?.body?.status === 'failed') throw new Error(data.body.message)
  return data?.body?.data ?? data?.data ?? {}
}

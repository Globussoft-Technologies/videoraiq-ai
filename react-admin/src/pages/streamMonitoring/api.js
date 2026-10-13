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

async function monitoringRequest(method, adminId, cameraId, suffix, data, params, signal) {
  const token = await waitForToken()
  const response = await axios({ method, data, params, signal,
    url: `${import.meta.env.VITE_BACKEND}/api/v1/stream-monitoring/admins/${encodeURIComponent(adminId)}/cameras/${encodeURIComponent(cameraId)}/${suffix}`,
    headers: { 'x-access-token': token },
  })
  if (response.data?.body?.status === 'failed') throw new Error(response.data.body.message)
  return response.data?.body?.data ?? {}
}
export const getMonitoringDetails = (adminId, cameraId, params, signal) => monitoringRequest('get', adminId, cameraId, 'details', undefined, params, signal)
export const setMonitoringMuted = (adminId, cameraId, muted) => monitoringRequest('put', adminId, cameraId, 'policy', { muted })

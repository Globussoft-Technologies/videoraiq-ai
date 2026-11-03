import axios from 'axios'
import { waitForToken } from '../../utils/waitForToken'

async function request(method, path, data, signal) {
  const token = await waitForToken()
  const response = await axios({ method, url: `${import.meta.env.VITE_BACKEND}/api/v1/whatsapp-key-requests${path}`, data, signal,
    headers: { 'x-access-token': token, 'Cache-Control': 'no-cache' } })
  return response.data
}
export const getKeyRequests = (status = 'pending', page = 1, signal) => request('get', `?status=${status}&page=${page}`, undefined, signal)
export const getPendingKeyCount = signal => request('get', '?countOnly=true', undefined, signal)
export const reviewKeyRequest = (adminId, requestId, decision) => request('post', `/${adminId}/${requestId}/decision`, { decision })

export async function sharedSenderRequest(method = 'get', suffix = '', data) {
  const token = await waitForToken()
  const response = await axios({ method, data, timeout: 120000,
    url: `${import.meta.env.VITE_BACKEND}/api/v1/whatsapp-sender${suffix}`,
    headers: { 'x-access-token': token } })
  return response.data
}

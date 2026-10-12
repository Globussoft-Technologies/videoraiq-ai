import axios from 'axios'
import { waitForToken } from '../../utils/waitForToken'

async function request(method, suffix, data, signal) {
  const token = await waitForToken()
  const response = await axios({ method, data, signal,
    url: `${import.meta.env.VITE_BACKEND}/api/v1/stream-monitoring/telegram/${suffix}`,
    headers: { 'x-access-token': token, ...(method === 'get' ? { 'Cache-Control': 'no-cache' } : {}) },
  })
  if (response.data?.body?.status === 'failed') throw new Error(response.data.body.message)
  return response.data?.body?.data ?? response.data?.data
}

export const getTelegramSettings = signal => request('get', 'link-code', undefined, signal)
export const selectTelegramChannel = chatId => request('put', 'selected-channel', { chatId })
export const unlinkTelegramChannel = chatId => request('post', 'unlink', { chatId })

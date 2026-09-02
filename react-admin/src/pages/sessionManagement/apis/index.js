import axios from 'axios'
import { waitForToken } from '../../../utils/waitForToken'

const apiUrl = import.meta.env.VITE_BACKEND
const basePath = '/api/v1/sessions'

const authHeaders = async () => ({
  'Content-Type': 'application/json',
  'x-access-token': await waitForToken(),
})

const appendFilters = (params, filters = {}) => {
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
}

export const getAdminSessions = async ({
  skip = 0,
  limit = 10,
  status = '',
  userType = '',
  userId = '',
  deviceId = '',
} = {}) => {
  const params = new URLSearchParams({ skip, limit })
  appendFilters(params, { status, userType, userId, deviceId })

  const response = await axios.get(`${apiUrl}${basePath}/admin?${params.toString()}`, {
    headers: await authHeaders(),
  })
  return response.data
}

export const getSessionSummary = async ({ status = '', userType = '', deviceId = '' } = {}) => {
  const params = new URLSearchParams()
  appendFilters(params, { status, userType, deviceId })
  const query = params.toString()

  const response = await axios.get(`${apiUrl}${basePath}/summary${query ? `?${query}` : ''}`, {
    headers: await authHeaders(),
  })
  return response.data
}

export const getSessionDetails = async (sessionId) => {
  const response = await axios.get(`${apiUrl}${basePath}/${sessionId}`, {
    headers: await authHeaders(),
  })
  return response.data
}

export const logoutSession = async (sessionId) => {
  const response = await axios.delete(`${apiUrl}${basePath}/${sessionId}`, {
    headers: await authHeaders(),
  })
  return response.data
}

export const deleteSession = async (sessionId) => {
  const response = await axios.delete(`${apiUrl}${basePath}/${sessionId}/delete`, {
    headers: await authHeaders(),
  })
  return response.data
}

export const bulkDeleteSessions = async (sessionIds = []) => {
  const response = await axios.delete(`${apiUrl}${basePath}/bulk/delete`, {
    headers: await authHeaders(),
    data: { sessionIds },
  })
  return response.data
}

export const blockSession = async (sessionId, reason = '') => {
  const response = await axios.patch(
    `${apiUrl}${basePath}/${sessionId}/block-session`,
    { reason },
    { headers: await authHeaders() }
  )
  return response.data
}

export const unblockSession = async (sessionId, reason = '') => {
  const response = await axios.patch(
    `${apiUrl}${basePath}/${sessionId}/unblock-session`,
    { reason },
    { headers: await authHeaders() }
  )
  return response.data
}

export const blockDevice = async (sessionId, reason = '') => {
  const response = await axios.patch(
    `${apiUrl}${basePath}/${sessionId}/block-device`,
    { reason },
    { headers: await authHeaders() }
  )
  return response.data
}

export const getBlockedDevices = async () => {
  const response = await axios.get(`${apiUrl}${basePath}/blocked-devices`, {
    headers: await authHeaders(),
  })
  return response.data
}

export const unblockDevice = async (deviceId, blockedDeviceId = '') => {
  const response = await axios.patch(
    `${apiUrl}${basePath}/devices/${encodeURIComponent(deviceId)}/unblock`,
    { blockedDeviceId },
    { headers: await authHeaders() }
  )
  return response.data
}

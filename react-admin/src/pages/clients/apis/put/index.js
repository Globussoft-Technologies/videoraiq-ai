import axios from 'axios'
import { waitForToken } from '../../../../utils/waitForToken'

const apiUrl = import.meta.env.VITE_BACKEND

const authHeaders = (token) => ({
  headers: {
    'Content-Type': 'application/json',
    'x-access-token': token,
  },
})

// Set the client's total purchased cameras.
export const updatePurchasedCameras = async (adminId, purchasedCameras) => {
  const token = await waitForToken()
  const response = await axios.put(
    `${apiUrl}/api/v1/client-config/${adminId}/purchased-cameras`,
    { purchasedCameras },
    authHeaders(token)
  )
  return response.data
}

// Set a single detection's camera allocation and/or enabled flag.
export const updateDetection = async (adminId, settingType, { cameraAllocation, enabled }) => {
  const token = await waitForToken()
  const response = await axios.put(
    `${apiUrl}/api/v1/client-config/${adminId}/detections/${settingType}`,
    { cameraAllocation, enabled },
    authHeaders(token)
  )
  return response.data
}

// Toggle one detection's enabled flag for a single camera (ClientCameraDetection).
export const updateCameraDetection = async (adminId, cameraId, { settingType, enabled }) => {
  const token = await waitForToken()
  const response = await axios.patch(
    `${apiUrl}/api/v1/client/${adminId}/cameras/${cameraId}/detections`,
    { settingType, enabled },
    authHeaders(token)
  )
  return response.data
}

/**
 * Refresh the platform detection list. Re-reads the shared catalog the client
 * backend publishes from its DETECTION_TYPES constants, so a detection added
 * there appears here without redeploying the superadmin service.
 */
export const syncDetectionCatalog = async () => {
  const token = await waitForToken()
  const response = await axios.post(
    `${apiUrl}/api/v1/detection-catalog/sync`,
    {},
    authHeaders(token)
  )
  return response.data
}

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

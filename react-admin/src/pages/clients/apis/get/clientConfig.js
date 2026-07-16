import axios from 'axios'
import { waitForToken } from '../../../../utils/waitForToken'

const apiUrl = import.meta.env.VITE_BACKEND

// Client Configuration screen: camera stats + per-detection assignment table.
export const getClientConfig = async (adminId) => {
  const token = await waitForToken()
  const response = await axios.get(`${apiUrl}/api/v1/client-config/${adminId}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  })

  return response.data
}

// A client's added cameras (isAdded: true) with NVR + per-detection enabled state.
export const getClientCameras = async (adminId) => {
  const token = await waitForToken()
  const response = await axios.get(`${apiUrl}/api/v1/client/${adminId}/cameras`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  })

  return response.data
}

import axios from 'axios'
import { waitForToken } from '../../../../utils/waitForToken'

const apiUrl = import.meta.env.VITE_BACKEND

// AI detection types available on the platform, with per-detection client counts.
export const getDetectionCatalog = async () => {
  const token = await waitForToken()
  const response = await axios.get(`${apiUrl}/api/v1/detection-catalog/`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  })

  return response.data
}

import axios from 'axios'
import { waitForToken } from '../../../../utils/waitForToken'

const apiUrl = import.meta.env.VITE_BACKEND

export const getClients = async (skip = 0, limit = 50, search = '') => {
  const token = await waitForToken()
  const response = await axios.get(
    `${apiUrl}/api/v1/client/admins?skip=${skip}&limit=${limit}&search=${encodeURIComponent(
      search
    )}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  )

  return response.data
}

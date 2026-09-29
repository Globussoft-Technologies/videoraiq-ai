import axios from 'axios'
import { waitForToken } from '../../../../utils/waitForToken'

const apiUrl = import.meta.env.VITE_BACKEND

// sortBy: name | email | login | createdAt (server default: createdAt)
// sortOrder: asc | desc (server default: desc)
export const getClients = async (
  skip = 0,
  limit = 50,
  search = '',
  sortBy = '',
  sortOrder = '',
  status = '',
  plan = '',
) => {
  const token = await waitForToken()
  const params = new URLSearchParams({ skip, limit, search })
  if (sortBy) params.set('sortBy', sortBy)
  if (sortOrder) params.set('sortOrder', sortOrder)
  if (status) params.set('status', status)
  if (plan) params.set('plan', plan)

  const response = await axios.get(`${apiUrl}/api/v1/client/admins?${params.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  })

  return response.data
}

import axios from 'axios'

const apiUrl = import.meta.env.VITE_BACKEND

export const signIn = async (data) => {
  const response = await axios.post(`${apiUrl}/api/v1/superAdmin/signin`, data, {
    headers: {
      'Content-Type': 'application/json',
    },
  })
  return response
}

export const forgotPassword = async (data) => {
  const response = await axios.post(
    `${apiUrl}/api/v1/superAdmin/forgot-password`,
    data,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
  return response
}

export const resetPassword = async (data) => {
  const response = await axios.post(
    `${apiUrl}/api/v1/superAdmin/reset-password`,
    data,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
  return response
}

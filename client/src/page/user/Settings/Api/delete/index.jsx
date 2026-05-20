import React from 'react';
import getAccessToken from '@/utils/getAccessToken';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
const apiUrl = import.meta.env.VITE_BACKEND;

export const removeRecipient = async (data) => {
  const token = getAccessToken();
  try {
    const response = await axios.delete(`${apiUrl}/api/v1/recipients/delete`, {
      headers: {
        'Content-type': 'application/json',
        'x-access-token': token,
      },
      data,
    });
    return response?.data?.body;
  } catch (error) {
      console.error('Error hitting channel API:', error);
  }
};

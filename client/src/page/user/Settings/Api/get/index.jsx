import React from "react";
import getAccessToken from "@/utils/getAccessToken";
import { jwtDecode } from 'jwt-decode';
import { waitForToken } from "@/utils/waitForToken";
const apiUrl = import.meta.env.VITE_BACKEND;
//  const token = getAccessToken();

export const getRecipients = async (type,searchTerm,filterValue,skip = 0, limit = 100) => {
  const token = await waitForToken();
  try {
    const response = await fetch(`${apiUrl}/api/v1/recipients/fetch?alertType=${type}&search=${searchTerm}&filterByStatus=${filterValue}&skip=${skip}&limit=${limit}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        'x-access-token': token,
      },
    });
    const data = await response.json();
   return data.body?.data?.alerts || [];
  } catch (error) {
    console.error("Error fetching recipients:", error);
  }
}

// Telegram: fetch the admin's verification code + current link status.
// Returns { code, linked, chatId } (or null on failure).
export const getTelegramLinkCode = async () => {
  const token = await waitForToken();
  try {
    const response = await fetch(`${apiUrl}/api/v1/telegram/link-code`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        'x-access-token': token,
      },
    });
    const data = await response.json();
    return data.body?.data || null;
  } catch (error) {
    console.error("Error fetching telegram link code:", error);
    return null;
  }
};

export const getDetectionTypes = async () => {
  const token = await waitForToken();
  try {
    const response = await fetch(`${apiUrl}/api/v1/detection-settings/types`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        'x-access-token': token,
      },
    });
    const data = await response.json();
    return data.body?.data?.detectionTypes || {};
  } catch (error) {
    console.error("Error fetching detection types:", error);
    return {};
  }
};
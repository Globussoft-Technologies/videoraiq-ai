import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';


const Api_url = import.meta.env.VITE_BACKEND;


// Fetch the admin's verification code + current link status.
// Returns { code, linked, chatId, channelName, channelUsername, chatType }, or null when the request fails so the
// caller can tell "not linked yet" apart from "couldn't load".
export const getTelegramLinkCode = async () => {
  const token = getAccessToken();
  try {
    const res = await axios.get(`${Api_url}/telegram/link-code`, {
      params: { _ts: Date.now() },
      headers: {
        'x-access-token': token,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
    return res?.data?.body?.data || null;
  } catch {
    return null;
  }
};

// Disconnect the bound channel. The backend clears the chatId and rotates the
// code, so callers should re-fetch link-code afterwards.
export const unlinkTelegram = async (chatId = null) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/telegram/unlink`,
    chatId ? { chatId } : {},
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data;
};

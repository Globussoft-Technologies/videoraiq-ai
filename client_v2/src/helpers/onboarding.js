import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

/**
 * Guided-tour onboarding state.
 *
 * Read over HTTP rather than from the JWT: the token is minted at login, so an
 * `onboarded` claim inside it would keep reading false for the rest of the
 * session after the user finishes the tour. The server resolves admin vs.
 * sub-user from the token itself (see admin.service.js fetchOnboarding).
 */
export const fetchOnboarding = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/admin/onboarding`, {
    headers: { 'x-access-token': token },
  });
  return res?.data?.body?.data ?? res?.data?.body ?? {};
};

/**
 * Persist the flag. Called with `true` only when the whole global flow is
 * finished or globally skipped — never when a single module is skipped.
 */
export const updateOnboarding = async (onboarded) => {
  const token = getAccessToken();
  const res = await axios.put(
    `${Api_url}/admin/onboarding`,
    { onboarded },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data?.body?.data ?? res?.data?.body ?? {};
};

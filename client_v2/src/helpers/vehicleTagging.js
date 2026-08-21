import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/**
 * Registered users that a detected plate can be tagged to — the same list the
 * Register your User page manages. Paginated and searchable by name/email.
 */
export const fetchTaggableUsers = async ({ skip = 0, limit = 20, search = '' } = {}) => {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
    search: search || '',
  });
  const res = await axios.post(
    `${Api_url}/authorizedUsers/fetch?${params.toString()}`,
    {},
    { headers: jsonHeaders() }
  );
  const data = res?.data?.body?.data || {};
  return { users: data.users || [], totalCount: data.totalCount || 0 };
};

/**
 * Write a detected vehicle number onto a registered user. From then on every
 * ANPR log and Vehicle Detection incident carrying that plate — past and
 * future — resolves to this user server-side.
 */
export const tagVehicleToUser = async ({ userId, vehicleNumber }) => {
  const res = await axios.patch(
    `${Api_url}/authorizedUsers/tag-vehicle`,
    { userId, vehicleNumber },
    { headers: jsonHeaders() }
  );
  return res?.data?.body;
};

/**
 * Remove a vehicle number from the user it was tagged to. The plate goes back
 * to reading as untagged everywhere, and Tag User becomes available again.
 */
export const untagVehicleFromUser = async ({ userId, vehicleNumber }) => {
  const res = await axios.patch(
    `${Api_url}/authorizedUsers/untag-vehicle`,
    { userId, vehicleNumber },
    { headers: jsonHeaders() }
  );
  return res?.data?.body;
};

/**
 * Full record for one registered user — everything the Tagged User details
 * card shows (profile images, phone, department, address), which the trimmed
 * `taggedUser` riding along on each log row deliberately leaves out.
 */
export const fetchRegisteredUser = async (userId) => {
  const res = await axios.post(
    `${Api_url}/authorizedUsers/fetch?userId=${encodeURIComponent(userId)}&skip=0&limit=1`,
    {},
    { headers: jsonHeaders() }
  );
  return res?.data?.body?.data?.users?.[0] || null;
};

/** Display name for a tagged-user record, whichever name fields it carries. */
export const taggedUserName = (user) => {
  if (!user) return '';
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.userName || user.email || 'Unnamed user';
};

/**
 * "ka02mp9657" → "KA02 MP9657". Falls back to a plain uppercase for anything
 * that isn't a recognisable Indian plate (test data, partial reads).
 */
export const formatPlate = (value) => {
  if (!value || value === '--') return '';
  const clean = String(value).trim().toUpperCase().replace(/\s+/g, '');
  const match = clean.match(/^([A-Z]{2}\d{1,2})([A-Z]{1,3}\d{1,4})$/);
  return match ? `${match[1]} ${match[2]}` : clean;
};

// A plate is taggable only once the detector actually read one. The log pages
// render a missing plate as "--", which normalises to empty here.
export const hasReadablePlate = (value) =>
  !!String(value ?? '').replace(/[^A-Za-z0-9]/g, '');

/** Case/separator-insensitive plate comparison, matching the server's rule. */
export const samePlate = (a, b) =>
  String(a ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() ===
  String(b ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Error message an API rejection carries, with a sensible fallback. */
export const tagApiError = (err, fallback) =>
  err?.response?.data?.body?.message ||
  err?.response?.data?.message ||
  fallback;

/** The all / tagged / not-tagged filter shared by ANPR Logs and Incident Center. */
export const TAG_STATUS_OPTIONS = [
  { key: '', label: 'All' },
  { key: 'tagged', label: 'Tagged' },
  { key: 'untagged', label: 'Not Tagged' },
];

// Detection types whose incidents carry a `vehicleNumber` and so can be tagged
// to a user. Matches the discriminators that declare the field server-side
// (see server/core/v1/incidents/incidents.model.js).
export const PLATE_BEARING_TYPES = ['vehicleDetection', 'vehicleObstruction'];

import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const headers = () => ({
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/**
 * One row per vehicle, not per crossing.
 *
 * The server groups by plate and returns each vehicle at its first check-in,
 * along with `custody` (checked in and not since checked back out) and the
 * per-vehicle counts the row summarises.
 */
export const fetchVehicleCheckInOutLogs = ({
  skip = 0,
  limit = 10,
  startDate,
  endDate,
  nvrIds,
  channelIds,
  severity,
  custody,
  search,
  sortOrder,
  // Export path: returns each vehicle's crossings inline, so the export makes
  // one request instead of one per vehicle.
  includeHistory,
} = {}) =>
  axios.post(
    `${HOST}/incidents/logs/vehicle-check-in-out`,
    {},
    {
      params: {
        skip,
        limit,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
        ...(channelIds?.length && { channelIds: channelIds.join(',') }),
        ...(severity && { severity }),
        // Only sent when actually filtering — omitted means "both".
        ...(custody === 'true' || custody === 'false' ? { custody } : {}),
        ...(search && { search }),
        ...(sortOrder && { sortOrder }),
        ...(includeHistory ? { includeHistory: 'true' } : {}),
      },
      headers: headers(),
    },
  );

/**
 * Every crossing for one vehicle — the sub-rows behind an expanded row.
 *
 * Takes the `vehicleKey` from the list rather than a plate, so a row whose
 * plate could not be read expands to its own single event instead of to every
 * other unreadable plate on the page.
 */
export const fetchVehicleCheckInOutHistory = ({ vehicleKey, startDate, endDate } = {}) =>
  axios.post(
    `${HOST}/incidents/logs/vehicle-check-in-out/history`,
    {},
    {
      params: {
        vehicleKey,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      },
      headers: headers(),
    },
  );

export const getNVRs = () =>
  axios.post(`${HOST}/authorizedChannels/getNVRS`, {}, { headers: headers() });

export const getChannels = (data) =>
  axios.post(`${HOST}/authorizedChannels/getChannels`, data, { headers: headers() });

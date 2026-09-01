import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/**
 * Paginated sleep-activity detection logs, newest first. Filters live in the
 * POST body: nvrIds/channelIds are comma-separated strings; `isSleeping` is an
 * optional boolean that narrows to only-sleeping / only-awake events (omit it
 * for all). Response: res.data.body.data => { data: [...records], totalCount }.
 * The endpoint path is backend-defined and unchanged.
 */
export const getSleepActivityLogs = async ({
  skip,
  limit,
  startDate,
  endDate,
  nvrIds,
  channelIds,
  isSleeping,
}) => {
  const body = {
    skip,
    limit,
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    ...(Array.isArray(nvrIds) && nvrIds.length > 0 && { nvrIds: nvrIds.join(',') }),
    ...(Array.isArray(channelIds) &&
      channelIds.length > 0 && { channelIds: channelIds.join(',') }),
    ...(typeof isSleeping === 'boolean' && { isSleeping }),
  };
  return axios.post(`${HOST}/incidents/logs/guard-sleeping`, body, {
    headers: jsonHeaders(),
  });
};

/** Authorized NVRs for the filter dropdown. */
export const getNVRs = async () =>
  axios.post(`${HOST}/authorizedChannels/getNVRS`, {}, { headers: jsonHeaders() });

/** Channels/cameras for the selected NVRs. */
export const getchannels = async (data) =>
  axios.post(`${HOST}/authorizedChannels/getChannels`, data, { headers: jsonHeaders() });

const idValue = (value) => value == null ? ''
  : String(typeof value === 'object' ? value._id || value.id || '' : value).trim();

export const packingNvrId = (value) => [
  value?.nvrId, value?.nvrData?._id, value?.nvrData?.id,
  value?.channelData?.nvrId, value?.cameraId?.nvrId,
  typeof value?.nvr === 'object' ? value.nvr : null,
].map(idValue).find(Boolean) || '';

const cameraIds = (value, isChannel = false) => [...new Set([
  value?.channelData?._id, value?.channelData?.id,
  ...(isChannel ? [value?._id, value?.id] : []),
  value?.cameraId, value?.channelId, value?.channelData?.channelId,
].map(idValue).filter(Boolean))];

export function samePackingCamera(row, channel) {
  const rowNvr = packingNvrId(row);
  const channelNvr = packingNvrId(channel);
  if (rowNvr && channelNvr && rowNvr !== channelNvr) return false;
  const rowIds = cameraIds(row);
  const channelIds = cameraIds(channel, true);
  // Numeric channel numbers are local to an NVR. Prefer document/camera IDs
  // when both sides provide them, so channel 1 cannot join unrelated cameras.
  const documentIds = (ids) => ids.filter((id) => !/^\d+$/.test(id));
  const rowDocuments = documentIds(rowIds);
  const channelDocuments = documentIds(channelIds);
  if (rowDocuments.length && channelDocuments.length) {
    return rowDocuments.some((id) => channelDocuments.includes(id));
  }
  return Boolean(rowNvr && channelNvr && rowNvr === channelNvr
    && rowIds.some((id) => channelIds.includes(id)));
}

export const packingStationKey = (value, isChannel = false) => {
  const ids = cameraIds(value, isChannel);
  const camera = ids.find((id) => !/^\d+$/.test(id)) || ids[0] || '';
  return JSON.stringify([packingNvrId(value), camera]);
};

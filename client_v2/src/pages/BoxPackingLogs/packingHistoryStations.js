import { packingStationKey, samePackingCamera, packingNvrId } from './packingIdentity.js';

// Live configuration controls streaming, not access to previously recorded data.
export function packingHistoryStations(channels = [], rows = []) {
  const stations = [...channels];
  for (const row of rows) {
    if (stations.some((channel) => samePackingCamera(row, channel))) continue;
    const key = packingStationKey(row);
    if (stations.some((channel) => channel._packingHistoryKey === key)) continue;
    stations.push({
      ...row.channelData,
      _id: row.channelData?._id || row.cameraId || row.channelId,
      nvrId: packingNvrId(row),
      _boxPackingCameraName: row.cameraName || row.camera || 'Packing camera',
      _boxPackingNvrName: row.nvrName || row.nvrData?.nvrName || 'NVR',
      _packingHistoryOnly: true, _packingHistoryKey: key,
    });
  }
  return stations;
}

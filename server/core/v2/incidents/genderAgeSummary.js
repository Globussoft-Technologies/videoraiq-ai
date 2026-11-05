import { GenderAgeDetectionIncident } from './incidents.model.js';

// Count detection images by camera, zone and gender in the selected range.
export async function getGenderAgeSummary(scope) {
  const groups = await GenderAgeDetectionIncident.aggregate([
    { $match: { ...scope, incidentType: 'genderAgeDetection' } },
    { $sort: { timeOfIncident: -1, _id: -1 } },
    { $group: {
      _id: {
        channelId: '$channelId',
        zoneKey: { $ifNull: ['$zoneIdx', { $ifNull: ['$zone', 'Full frame'] }] },
        gender: '$targetGender',
      },
      count: { $sum: 1 },
      zoneIdx: { $first: '$zoneIdx' },
      zone: { $first: '$zone' },
    } },
    { $lookup: { from: 'channels', localField: '_id.channelId', foreignField: '_id', as: 'camera' } },
  ]);

  const summary = { femaleCount: 0, maleCount: 0, totalCount: 0, zones: [] };
  const zoneMap = new Map();
  for (const group of groups) {
    const { channelId, zoneKey, gender } = group._id;
    if (gender !== 'Female' && gender !== 'Male') continue;
    const key = `${channelId}:${zoneKey}`;
    if (!zoneMap.has(key)) {
      const zoneIdx = group.zoneIdx ?? null;
      const zone = {
        cameraId: String(channelId),
        cameraName: group.camera?.[0]?.name || 'Camera',
        zoneIdx,
        zone: group.zone || (zoneIdx == null ? 'Full frame' : `Zone ${zoneIdx + 1}`),
        femaleCount: 0, maleCount: 0, totalCount: 0,
      };
      zoneMap.set(key, zone);
      summary.zones.push(zone);
    }
    const zone = zoneMap.get(key);
    zone[gender === 'Female' ? 'femaleCount' : 'maleCount'] += group.count;
    zone.totalCount += group.count;
    summary[gender === 'Female' ? 'femaleCount' : 'maleCount'] += group.count;
    summary.totalCount += group.count;
  }
  summary.zones.sort((a, b) => a.cameraName.localeCompare(b.cameraName) ||
    (a.zoneIdx ?? Number.MAX_SAFE_INTEGER) - (b.zoneIdx ?? Number.MAX_SAFE_INTEGER) ||
    a.zone.localeCompare(b.zone));
  return summary;
}

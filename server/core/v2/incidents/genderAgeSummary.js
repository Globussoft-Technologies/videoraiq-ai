import { GenderAgeCountIncident, GenderAgeDetectionIncident } from './incidents.model.js';

// The headline counts are alert logs; the zone rows are count snapshots.
// They are separate incident types and must never be added together.
export async function getGenderAgeSummary(scope) {
  const snapshotScope = { ...scope, incidentType: 'genderAgeCount' };
  const [alertCounts, snapshots] = await Promise.all([
    GenderAgeDetectionIncident.aggregate([
      { $match: { ...scope, incidentType: 'genderAgeDetection' } },
      { $group: { _id: '$targetGender', count: { $sum: 1 } } },
    ]),
    GenderAgeCountIncident.aggregate([
      { $match: snapshotScope },
      { $sort: { channelId: 1, timeOfIncident: -1, _id: -1 } },
      { $group: { _id: '$channelId', snapshot: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$snapshot' } },
      { $lookup: { from: 'channels', localField: 'channelId', foreignField: '_id', as: 'camera' } },
      { $sort: { channelId: 1 } },
    ]),
  ]);
  const counts = Object.fromEntries(alertCounts.map(({ _id, count }) => [_id, count]));
  const summary = { femaleCount: counts.Female || 0, maleCount: counts.Male || 0, totalCount: 0, zones: [] };
  for (const snapshot of snapshots) {
    const zones = snapshot.zones?.length ? snapshot.zones : [{
      zone_idx: null, zone: 'Full frame', female_count: snapshot.femaleCount, male_count: snapshot.maleCount,
    }];
    for (const zone of zones) summary.zones.push({
      cameraId: String(snapshot.channelId), cameraName: snapshot.camera?.[0]?.name || 'Camera',
      zoneIdx: zone.zone_idx, zone: zone.zone,
      femaleCount: zone.female_count, maleCount: zone.male_count,
      totalCount: zone.female_count + zone.male_count, timeOfIncident: snapshot.timeOfIncident,
    });
  }
  summary.totalCount = summary.femaleCount + summary.maleCount;
  return summary;
}

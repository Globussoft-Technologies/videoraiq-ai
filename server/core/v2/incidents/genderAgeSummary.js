import { GenderAgeCountIncident } from './incidents.model.js';

// Header totals sum count posts in the selected range; zone rows show the
// latest camera snapshots independently of the historical range.
export async function getGenderAgeSummary(scope) {
  const liveScope = { ...scope, incidentType: 'genderAgeCount' };
  delete liveScope.timeOfIncident;
  delete liveScope.$expr;
  const [totals, snapshots] = await Promise.all([
    GenderAgeCountIncident.aggregate([
      { $match: { ...scope, incidentType: 'genderAgeCount' } },
      { $group: { _id: null, femaleCount: { $sum: '$femaleCount' }, maleCount: { $sum: '$maleCount' } } },
    ]),
    GenderAgeCountIncident.aggregate([
      { $match: liveScope },
      { $sort: { channelId: 1, timeOfIncident: -1, _id: -1 } },
      { $group: { _id: '$channelId', snapshot: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$snapshot' } },
      { $lookup: { from: 'channels', localField: 'channelId', foreignField: '_id', as: 'camera' } },
      { $sort: { channelId: 1 } },
    ]),
  ]);
  const summary = { femaleCount: totals[0]?.femaleCount || 0, maleCount: totals[0]?.maleCount || 0, totalCount: 0, zones: [] };
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

import { DETECTION_FIELD_KEYS, ZONE_EXTRA_FIELDS } from './constants';
import { scheduleFromConfig } from '../ZoneScheduleFields';

export function extraFieldsFor(settingType) {
  return ZONE_EXTRA_FIELDS[settingType] || [];
}

export function zonesFor(setting, cameraId) {
  const raw = setting?.settings?.referencePoints?.[cameraId];
  const configs = setting?.settings?.zone_configs || [];
  if (!Array.isArray(raw) || !raw.length) return [];

  const isMultiZone = Array.isArray(raw[0]?.[0]);
  const polygons = isMultiZone ? raw : [raw];
  return polygons.map((poly, i) => ({
    name: configs[i]?.name || `Zone ${i + 1}`,
    capacity: configs[i]?.capacity ?? '',
    threshold: configs[i]?.threshold_sec ?? '',
    countMode: setting?.settings?.count_mode === 'all' ? 'both' : (setting?.settings?.count_mode || 'entry'),
    schedule: scheduleFromConfig(configs[i]),
    insideReferencePoint: Array.isArray(setting?.settings?.inside_reference_point)
      ? {
          x: setting.settings.inside_reference_point[0],
          y: setting.settings.inside_reference_point[1],
        }
      : null,
    points: (poly || []).map(p => (Array.isArray(p) ? { x: p[0], y: p[1] } : p)),
  }));
}

export function allTypesFor(camera, typeLabels) {
  const detections = camera?.detections || {};
  return DETECTION_FIELD_KEYS
    .filter(key => typeLabels[key])
    .map(key => {
      const entry = detections[key];
      const setting = entry?.id && typeof entry.id === 'object' ? entry.id : null;
      const settingId = setting?._id || (entry?.id && typeof entry.id !== 'object' ? entry.id : null);
      const hasZones = zonesFor(setting, camera?._id).length > 0;
      return {
        settingType: key,
        label: typeLabels[key],
        configured: !!settingId && hasZones,
        settingId,
        setting,
      };
    });
}

export function polygonPointsAttr(points, videoW, videoH, boxW, boxH) {
  if (!videoW || !videoH) return '';
  return points.map(p => `${(p.x / videoW * boxW).toFixed(1)},${(p.y / videoH * boxH).toFixed(1)}`).join(' ');
}

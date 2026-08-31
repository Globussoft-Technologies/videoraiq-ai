import {
  ATTENDANCE_DETECTION_NAME,
  DETECTION_FIELD_KEYS,
  ZONE_EXTRA_FIELDS,
  isAttendanceDetectionType,
} from './constants';
import { scheduleFromConfig } from '../ZoneScheduleFields';

export function extraFieldsFor(settingType) {
  return ZONE_EXTRA_FIELDS[settingType] || [];
}

export function zonesFor(setting, cameraId) {
  const raw = setting?.settings?.referencePoints?.[cameraId];
  const configs = setting?.settings?.zone_configs || [];
  const telegramChatId = setting?.settings?.telegramChatId || '';
  const telegramChatIds = Array.isArray(setting?.settings?.telegramChatIds)
    ? setting.settings.telegramChatIds
    : [];
  if (!Array.isArray(raw) || !raw.length) return [];

  const isMultiZone = Array.isArray(raw[0]?.[0]);
  const polygons = isMultiZone ? raw : [raw];
  return polygons.map((poly, i) => ({
    name: configs[i]?.name || `Zone ${i + 1}`,
    capacity: configs[i]?.capacity ?? '',
    threshold: configs[i]?.threshold_sec ?? '',
    countMode: setting?.settings?.count_mode === 'all' ? 'both' : (setting?.settings?.count_mode || 'entry'),
    schedule: scheduleFromConfig(configs[i]),
    telegramChatIds: Array.isArray(configs[i]?.telegramChatIds)
      ? configs[i].telegramChatIds.map(id => String(id || '').trim()).filter(Boolean)
      : (configs[i]?.telegramChatId
        ? [String(configs[i].telegramChatId).trim()].filter(Boolean)
        : telegramChatIds.length
          ? telegramChatIds.map(id => String(id || '').trim()).filter(Boolean)
          : telegramChatId
            ? [String(telegramChatId).trim()].filter(Boolean)
            : []),
    telegramChatId: configs[i]?.telegramChatId || telegramChatId || '',
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
  const apiTypeKeys = Array.isArray(typeLabels)
    ? typeLabels.map((type, index) => type?.settingType || type?.detectionType || type?.key || type?.id || `type-${index}`)
    : Object.keys(typeLabels || {});
  const fieldKeys = [...new Set([...DETECTION_FIELD_KEYS, ...apiTypeKeys].filter(Boolean))];
  const labelFor = (key) => {
    if (isAttendanceDetectionType(key)) return ATTENDANCE_DETECTION_NAME;
    if (Array.isArray(typeLabels)) {
      const match = typeLabels.find((type) => (type?.settingType || type?.detectionType || type?.key || type?.id) === key);
      return match?.displayName || match?.label || match?.name || match?.detectionName || key;
    }
    return typeLabels?.[key];
  };

  return fieldKeys
    .filter(key => labelFor(key))
    .map(key => {
      const entry = detections[key];
      const setting = entry?.id && typeof entry.id === 'object' ? entry.id : null;
      const settingId = setting?._id || (entry?.id && typeof entry.id !== 'object' ? entry.id : null);
      const hasZones = zonesFor(setting, camera?._id).length > 0;
      return {
        settingType: key,
        label: labelFor(key),
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

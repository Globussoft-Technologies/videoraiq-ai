import moment from 'moment-timezone';
import { HYGIENE_CATEGORY_OPTIONS, hygieneCategoryLabel } from '../../helpers/hygieneDetection.js';

export const HYGIENE_REPORT_TYPES = [
  { id: 'categories', title: 'Category comparison', description: 'Bypass, unsafe product contact and contamination risks' },
  { id: 'locations', title: 'Camera & zone report', description: 'Incidents, severity and unresolved alerts by location' },
  { id: 'recurring', title: 'Recurring risk report', description: 'Repeated incidents for each location and risk category' },
  { id: 'hourly', title: 'Hourly activity', description: 'Incident and category violation counts for all 24 hours' },
  { id: 'daily', title: 'Daily incident summary', description: 'Daily volume, high-severity and unresolved incidents' },
];

export function buildHygieneReportRows(type, data, trend, cameraName) {
  if (!data) return [];
  if (type === 'categories') return HYGIENE_CATEGORY_OPTIONS.map(c => {
    const row = data.categories?.find(r => r._id === c.id);
    const total = (data.categories || []).reduce((sum, r) => sum + r.violations, 0);
    return { Category: c.label, Violations: row?.violations || 0, 'Share of classified violations': total ? `${Math.round((row?.violations || 0) / total * 100)}%` : 'Unavailable', 'High severity violations': row?.high || 0, 'Mean confidence': row?.confidence == null ? 'Unavailable' : `${Math.round(row.confidence * 100)}%`, 'Confidence samples': row?.confidenceSamples || 0 };
  });
  if (type === 'locations') return (data.zones || []).map(r => ({ Camera: cameraName(r._id.camera), Zone: r._id.zone, Incidents: r.incidents, Violations: r.violations, 'High severity incidents': r.high, 'Unresolved incidents': r.open }));
  if (type === 'recurring') return (data.categoryZones || []).filter(r => r.incidents > 1).map(r => ({ Camera: cameraName(r._id.camera), Zone: r._id.zone, Category: hygieneCategoryLabel(r._id.category), Incidents: r.incidents, Violations: r.violations, 'Latest detection': moment(r.lastSeen).tz(data.timezone).format('YYYY-MM-DD HH:mm:ss'), Timezone: data.timezone }));
  if (type === 'hourly') return Array.from({ length: 24 }, (_, hour) => {
    const r = data.hours?.find(row => row._id === hour) || {};
    return { Hour: `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`, Timezone: data.timezone, Incidents: r.incidents || 0, Violations: r.violations || 0,
      ...Object.fromEntries(HYGIENE_CATEGORY_OPTIONS.map(c => [c.label, data.categoryHours?.find(row => row._id.hour === hour && row._id.category === c.id)?.violations || 0])),
      'High severity incidents': r.high || 0, 'Unresolved incidents': r.open || 0 };
  });
  if (type === 'daily') return trend.map(r => ({ Date: r._id, Incidents: r.incidents, Violations: r.violations, 'High severity incidents': r.high || 0, 'Unresolved incidents': r.open || 0 }));
  return [];
}

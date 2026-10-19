import { describe, expect, it } from 'vitest';
import { buildHygieneReportRows } from '../../../../client_v2/src/pages/HygieneAnalytics/hygieneReportRows.js';

const cameraName = () => 'Prep camera';
const data = { timezone: 'Asia/Kolkata', categories: [{ _id: 'productContact', violations: 2, high: 1, confidence: .82, confidenceSamples: 1 }],
  hours: [{ _id: 8, incidents: 1, violations: 2, high: 1, open: 0 }], categoryHours: [{ _id: { category: 'productContact', hour: 8 }, violations: 2 }],
  zones: [{ _id: { camera: 'camera', zone: 'Prep' }, incidents: 1, violations: 2, high: 1, open: 0 }],
  categoryZones: [{ _id: { camera: 'camera', zone: 'Prep', category: 'productContact' }, incidents: 2, violations: 3, lastSeen: '2026-10-16T03:00:00Z' }, { _id: { camera: 'camera', zone: 'Wash', category: 'handHygieneBypass' }, incidents: 1, violations: 1, lastSeen: '2026-10-16T03:00:00Z' }] };
describe('hygiene report rows', () => {
  it('reports categories with missing confidence as unavailable', () => {
    const rows = buildHygieneReportRows('categories', data, [], cameraName);
    expect(rows).toHaveLength(6);
    expect(rows[0]['Mean confidence']).toBe('Unavailable');
    expect(rows[1]).toMatchObject({ Violations: 2, 'Mean confidence': '82%', 'Confidence samples': 1, 'Share of classified violations': '100%' });
  });
  it('exports 24 hours with category counts and zeros for absent hours', () => {
    const rows = buildHygieneReportRows('hourly', data, [], cameraName);
    expect(rows).toHaveLength(24);
    expect(rows[8]).toMatchObject({ Incidents: 1, Violations: 2, 'Product on Floor / Unclean Surface': 2 });
    expect(rows[0].Incidents).toBe(0);
  });
  it('only lists repeated category/location incidents and uses the account timezone', () => {
    const rows = buildHygieneReportRows('recurring', data, [], cameraName);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Camera: 'Prep camera', Incidents: 2, Violations: 3, 'Latest detection': '2026-10-16 08:30:00' });
  });
  it('keeps incident totals distinct from violations in location and daily reports', () => {
    expect(buildHygieneReportRows('locations', data, [], cameraName)[0]).toMatchObject({ Incidents: 1, Violations: 2 });
    expect(buildHygieneReportRows('daily', data, [{ _id: '2026-10-16', incidents: 1, violations: 2 }], cameraName)[0]).toMatchObject({ Incidents: 1, Violations: 2 });
  });
});

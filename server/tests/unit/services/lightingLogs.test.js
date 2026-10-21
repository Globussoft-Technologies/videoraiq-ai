import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../socket.js', () => ({ sendPayloadToUser: vi.fn() }));
vi.mock('../../../core/v2/alerts/alert.events.js', () => ({ triggerAlertOnIncident: vi.fn() }));
const { default: service } = await import('../../../core/v2/incidents/incidents.service.js');

describe('lighting category log filters', () => {
  it('matches detected violations, rather than all selected categories', async () => {
    const context = { _fetchIncidentLogs: vi.fn().mockResolvedValue('ok') };
    await service.getLightingVisibilitySiteConditionsDetectionLogs.call(context,
      { query: { lightingCategory: 'lowVisibility,weatherSiteHazard,lowVisibility' } }, {}, vi.fn());
    expect(context._fetchIncidentLogs).toHaveBeenCalledWith(expect.objectContaining({
      incidentType: 'lightingVisibilitySiteConditionsDetection',
      extraMatch: { 'violations.category': { $in: ['lowVisibility', 'weatherSiteHazard'] } },
    }));
  });
  it.each(['unknown', ['lowVisibility']])('rejects invalid categories: %s', async lightingCategory => {
    const context = { _fetchIncidentLogs: vi.fn() };
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await service.getLightingVisibilitySiteConditionsDetectionLogs.call(context, { query: { lightingCategory } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(context._fetchIncidentLogs).not.toHaveBeenCalled();
  });
});

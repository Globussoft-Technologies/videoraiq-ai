import { describe, expect, it } from 'vitest';
import { delegatedRouteAllowed } from '../../middlewares/verifyToken.js';

const allowed = (method, originalUrl, scopes = ['read']) => delegatedRouteAllowed({ method, originalUrl }, scopes);
describe('delegated detection agent route scope', () => {
  it('allows scoped reads and preparation', () => {
    expect(allowed('GET', '/api/v2/analytics/activity-heatmap')).toBe(true);
    expect(allowed('POST', '/api/v2/incidents/', ['read'])).toBe(true);
    expect(allowed('POST', '/api/v2/agent-actions/prepare', ['read', 'prepare'])).toBe(true);
  });
  it('refuses decisions and direct writes', () => {
    expect(allowed('POST', '/api/v2/agent-actions/abc/decision', ['read', 'prepare'])).toBe(false);
    expect(allowed('PUT', '/api/v2/detection-settings/abc', ['read', 'prepare'])).toBe(false);
    expect(allowed('POST', '/api/v2/users/create', ['read', 'prepare'])).toBe(false);
    expect(allowed('GET', '/api/v2/admin/private')).toBe(false);
    expect(allowed('POST', '/api/v2/agent-actions/abc/execute', ['read'])).toBe(false);
  });
});

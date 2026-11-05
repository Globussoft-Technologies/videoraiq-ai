import { describe, it, expect, vi } from 'vitest';
import { rememberRequestAdmin, requestAdmin } from '../../../utils/requestAdmin.js';

describe('request-local admin reuse', () => {
  it('reuses the verified record without adding fields to downstream identity', async () => {
    const req = { verified: { userData: { adminId: 'a' } } };
    const admin = { _id: 'a', user_id: 'ds-user', timezone: 'Asia/Kolkata' };
    const original = JSON.stringify(req);
    const load = vi.fn();
    rememberRequestAdmin(req, admin);
    expect(await requestAdmin(req, load)).toBe(admin);
    expect(load).not.toHaveBeenCalled();
    expect(JSON.stringify(req)).toBe(original);
  });

  it('loads afresh for a different request, changed owner, or service identity', async () => {
    const req = { verified: { userData: { adminId: 'a' } } };
    rememberRequestAdmin(req, { _id: 'a' });
    const load = vi.fn().mockResolvedValue({ _id: 'fresh' });
    await requestAdmin({ verified: req.verified }, load);
    req.verified.userData.adminId = 'b';
    await requestAdmin(req, load);
    delete req.verified.userData.adminId;
    await requestAdmin(req, load);
    expect(load).toHaveBeenCalledTimes(3);
  });
});

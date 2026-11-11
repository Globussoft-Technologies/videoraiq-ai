import { describe, it, expect, afterEach, vi } from 'vitest';
const calls = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn(), stop: vi.fn() }));
vi.mock('../../core/v1/admin/admin.model.js', () => ({ default: {
  find: calls.read, findById: calls.read, updateOne: calls.update,
} }));
vi.mock('../../utils/stopStreams.js', () => ({stopAllStreams:calls.stop}));
import {expireSubscription,activateSubscription,runSubscriptionExpirySweep,scheduleSubscriptionExpirySweep}
  from '../../services/subscriptionExpiry.js';
afterEach(() => { delete process.env.XRAY_LOCAL_TEST_MODE; vi.restoreAllMocks(); });
describe('shared dev subscription safety in local X-Ray mode',()=>{
  it('login and request expiry/renewal paths do not read or mutate shared camera configuration',async()=>{
    process.env.XRAY_LOCAL_TEST_MODE='true';
    await expireSubscription('admin-a');
    await activateSubscription({_id:'admin-a',streamsStopped:true},{plan:'2030-01-01'});
    await runSubscriptionExpirySweep();
    expect(calls.read).not.toHaveBeenCalled();
    expect(calls.update).not.toHaveBeenCalled();
    expect(calls.stop).not.toHaveBeenCalled();
  });
  it('starting the periodic expiry runner in local mode schedules no work',()=>{
    process.env.XRAY_LOCAL_TEST_MODE='true';
    const interval=vi.spyOn(globalThis,'setInterval');
    scheduleSubscriptionExpirySweep();
    expect(interval).not.toHaveBeenCalled();
    expect(calls.read).not.toHaveBeenCalled();
  });
});

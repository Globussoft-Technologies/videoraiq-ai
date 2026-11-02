import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../core/v2/channels/channels.model.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../../../core/v2/NVR/nvr.model.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../../../core/v2/admin/admin.model.js', () => ({ default: { findById: vi.fn() } }));

import Channel from '../../../../core/v2/channels/channels.model.js';
import NVR from '../../../../core/v2/NVR/nvr.model.js';
import Admin from '../../../../core/v2/admin/admin.model.js';
import { getCameraDetails, listCameraDetails } from '../../../../core/v2/channels/cameraDetails.service.js';

const cameraId = '507f1f77bcf86cd799439011';
const nvrId = '507f1f77bcf86cd799439012';
const principal = { adminId: '507f1f77bcf86cd799439013' };
const lean = value => ({ lean: async () => value });

beforeEach(() => {
  vi.clearAllMocks();
  Admin.findById.mockReturnValue({ select: () => lean({ user_id: 'tenant' }) });
  Channel.findOne.mockReturnValue(lean({ _id: cameraId, nvrId, userId: 'tenant', name: 'Gate', control: 1,
    latestSnapshot: { path: '/uploads/images/tenant/new.jpg', capturedAt: new Date('2026-10-28T10:00:00Z') } }));
  NVR.findOne.mockReturnValue(lean({ _id: nvrId, nvrName: 'Recorder', location: 'North', brand: 'hikvision' }));
  NVR.find.mockReturnValue({ select: () => lean([{ _id: nvrId, nvrName: 'Recorder', location: 'North' }]) });
  Channel.find.mockReturnValue({ select: () => lean([{ _id: cameraId, nvrId, name: 'Gate', control: 1,
    latestSnapshot: { path: '/new.jpg', capturedAt: new Date('2026-10-28T10:00:00Z') } }]) });
});

describe('camera details', () => {
  it('returns the tenant camera, its recorder, and the committed latest snapshot', async () => {
    const result = await getCameraDetails(cameraId, principal);
    expect(result.code).toBe(200);
    expect(Channel.findOne).toHaveBeenCalledWith({ _id: cameraId, userId: 'tenant' });
    expect(NVR.findOne).toHaveBeenCalledWith({ _id: nvrId, userId: 'tenant' });
    expect(result.data.camera).toMatchObject({ name: 'Gate', location: 'North', status: 'running' });
    expect(result.data.nvr.name).toBe('Recorder');
    expect(result.data.snapshot).toMatchObject({ status: 'available', capturedAt: new Date('2026-10-28T10:00:00Z') });
    expect(result.data.snapshot.imageUrl).toContain('/uploads/images/tenant/new.jpg');
  });
  it('does not expose a camera to an unauthorized member', async () => {
    expect((await getCameraDetails(cameraId, { ...principal, memberId: 'member' }, [])).code).toBe(404);
    expect(Channel.findOne).not.toHaveBeenCalled();
  });
  it('returns not found for a camera outside the tenant', async () => {
    Channel.findOne.mockReturnValue(lean(null));
    expect((await getCameraDetails(cameraId, principal)).code).toBe(404);
  });
  it('retains camera details when its NVR or snapshot is missing', async () => {
    Channel.findOne.mockReturnValue(lean({ _id: cameraId, nvrId, name: 'Gate', control: 0 }));
    NVR.findOne.mockReturnValue(lean(null));
    const result = await getCameraDetails(cameraId, principal);
    expect(result.data).toMatchObject({ nvr: null, snapshot: { status: 'unavailable' } });
    expect(result.data.camera.status).toBe('stopped');
  });
  it('validates IDs and rejects missing accounts', async () => {
    expect((await getCameraDetails('bad', principal)).code).toBe(400);
    Admin.findById.mockReturnValue({ select: () => lean(null) });
    expect((await getCameraDetails(cameraId, principal)).code).toBe(403);
  });
  it('groups cameras and latest snapshots under their NVR', async () => {
    const result = await listCameraDetails(principal);
    expect(result.data).toMatchObject({ totalNvrs: 1, totalCameras: 1 });
    expect(result.data.nvrs[0].cameras[0].snapshot.status).toBe('available');
  });
  it('applies escaped name filters and member camera scope', async () => {
    await listCameraDetails({ ...principal, memberId: 'member' }, [cameraId], { nvrName: 'Rec.*', cameraName: 'Gate' });
    expect(NVR.find.mock.calls[0][0].nvrName.$regex).toBe('Rec\\.\\*');
    expect(Channel.find.mock.calls[0][0]).toMatchObject({ _id: { $in: [cameraId] } });
  });
  it('supports exact camera ID filtering without bypassing member authorization', async () => {
    await listCameraDetails({ ...principal, memberId: 'member' }, [cameraId], { cameraId });
    expect(Channel.find.mock.calls[0][0]._id).toEqual({ $in: [cameraId] });
    await listCameraDetails({ ...principal, memberId: 'member' }, [], { cameraId });
    expect(Channel.find.mock.calls[1][0]._id).toEqual({ $in: [] });
  });
  it('supports exact NVR ID filtering', async () => {
    await listCameraDetails(principal, [], { nvrId });
    expect(NVR.find.mock.calls[0][0]).toMatchObject({ _id: nvrId, userId: 'tenant' });
    expect((await listCameraDetails(principal, [], { nvrId: 'bad' })).code).toBe(400);
  });
  it('hides empty NVRs from members and returns unavailable snapshots', async () => {
    Channel.find.mockReturnValue({ select: () => lean([]) });
    const result = await listCameraDetails({ ...principal, memberId: 'member' }, []);
    expect(result.data.nvrs).toEqual([]);
    Channel.find.mockReturnValue({ select: () => lean([{ _id: cameraId, nvrId, name: 'Gate' }]) });
    expect((await listCameraDetails(principal)).data.nvrs[0].cameras[0].snapshot.status).toBe('unavailable');
  });
});

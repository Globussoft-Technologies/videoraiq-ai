import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
vi.mock('../../../utils/database.js', () => ({ redis: {} }));
vi.mock('../../../utils/stopStreams.js', () => ({ stopAllStreams: vi.fn() }));
vi.mock('../../../core/v2/Auth/refreshToken.service.js', () => ({
  refreshBrowserTokens: vi.fn(), issueBrowserTokens: vi.fn(), logoutBrowserSession: vi.fn(),
}));
const { refreshBrowserTokens } = await import('../../../core/v2/Auth/refreshToken.service.js');
const { default: Channel } = await import('../../../core/v1/channels/channels.model.js');
const { default: mongoose } = await import('mongoose');

const { default: AUTHService } = await import(
  "../../../core/v2/Auth/auth.service.js"
);
const { default: Admin } = await import(
  "../../../core/v2/admin/admin.model.js"
);

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);
afterEach(() => vi.restoreAllMocks());

describe("v2 subscription snapshot persistence", () => {
  it('pauses detection and resets camera types when session refresh discovers expired access', async () => {
    const admin = await Admin.create({ user_id: '42', login: 'expired-refresh', email: 'expired-refresh@test.test',
      subscriptionSnapshot: { expiresAt: new Date('2099-01-01') } });
    const camera = await Channel.create({ userId: '42', nvrId: new mongoose.Types.ObjectId(), isAdded: true, checkType: 'checkin',
      detections: { crowdDetectionSettings: { id: new mongoose.Types.ObjectId(), enabled: true },
        faceAuthenticationSettings: { id: new mongoose.Types.ObjectId(), enabled: true } } });
    vi.spyOn(AUTHService, 'getAmemberAccessByUserId').mockResolvedValue({ 0: { product_id: 3, expire_date: '2020-01-01' } });
    refreshBrowserTokens.mockImplementation((req, res, resolveClaims) => resolveClaims({}, admin, admin));
    expect(await AUTHService.refresh({}, {})).toBeNull();
    expect((await Admin.findById(admin._id)).streamsStopped).toBe(true);
    expect((await Channel.findById(camera._id)).toObject()).toMatchObject({
      subscriptionPaused: true, detectionBulkPaused: true, checkType: 'none',
      detections: { crowdDetectionSettings: { enabled: false }, faceAuthenticationSettings: { enabled: false } },
    });
  });
  it("stores the authenticated subscription and normalized current plan", async () => {
    const admin = await Admin.create({
      user_id: "13",
      login: "pavank",
      email: "pavan.kumar@example.com",
    });

    await AUTHService.persistSubscriptionSnapshot(
      admin._id,
      { 4: "2026-09-23" },
      {
        id: 4,
        name: "Free Lifetime",
        expiresAt: "2026-09-23T23:59:59.999Z",
      },
    );

    const updated = await Admin.findById(admin._id).lean();
    expect(updated.subscriptionSnapshot).toMatchObject({
      subscriptions: { 4: "2026-09-23" },
      planId: "4",
      planName: "Free Lifetime",
      expiresAt: new Date("2026-09-23T23:59:59.999Z"),
      source: "amember_login",
    });
    expect(updated.subscriptionSnapshot.syncedAt).toBeInstanceOf(Date);
  });
});

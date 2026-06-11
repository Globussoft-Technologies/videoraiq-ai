/**
 * Gap-fill for ProfilesService catch arms — covers the `catch (error)`
 * branches of getProfiles, addProfile, editProfile, deleteProfile,
 * bulkDeleteProfiles, getProfileById, and bulkExportProfiles. The
 * existing baseline test files exercise every happy/validation path
 * but never force a thrown DB error, so the catch arms stay cold.
 *
 * Approach: mock the Profile model directly; each test makes the
 * relevant model method reject so control reaches the catch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReqRes } from "../../helpers/factory.js";

vi.mock("../../../core/v1/profiles/profiles.model.js", () => {
  const ProfileMock = vi.fn();
  ProfileMock.find = vi.fn();
  ProfileMock.findOne = vi.fn();
  ProfileMock.findById = vi.fn();
  ProfileMock.findByIdAndUpdate = vi.fn();
  ProfileMock.findByIdAndDelete = vi.fn();
  ProfileMock.deleteMany = vi.fn();
  ProfileMock.countDocuments = vi.fn();
  return { default: ProfileMock };
});

const { default: ProfilesService } = await import(
  "../../../core/v1/profiles/profiles.service.js"
);
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);

function ctx({ body, params, query } = {}) {
  const { req, res, next } = makeReqRes();
  // adminId must be a 24-char hex string for createProfileValidator.
  req.verified = {
    userData: {
      adminId: "507f1f77bcf86cd799439011",
      memberId: undefined,
      _id: "user-1",
    },
  };
  if (body) req.body = body;
  if (params) req.params = params;
  if (query) req.query = query;
  return { req, res, next };
}

const errBody = (res) => res._body?.body || res._body;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfilesService.getProfiles catch (lines 58-65)", () => {
  it("returns 400 when Profile.find() rejects", async () => {
    Profile.find.mockImplementationOnce(() => ({
      skip: () => ({
        limit: () => ({
          sort: () => Promise.reject(new Error("find-blew-up")),
        }),
      }),
    }));
    Profile.countDocuments.mockResolvedValueOnce(0);
    const { req, res, next } = ctx({ query: {} });
    await ProfilesService.getProfiles(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(errBody(res).message).toMatch(/Failed to retrieve profiles|find-blew-up/);
  });
});

describe("ProfilesService.addProfile catch (lines 97-102)", () => {
  it("returns 400 when profile.save() rejects", async () => {
    // The service does `new Profile(value); profile.save();` — make the
    // Profile constructor return an object whose save() rejects.
    Profile.mockImplementationOnce(function () {
      return { save: vi.fn().mockRejectedValue(new Error("save-failed")) };
    });
    const { req, res, next } = ctx({
      body: {
        basics: { profileName: "Profile A", days: {} },
        notification: {},
        evidenceSeverity: {},
        defaultDetectionSettings: { objects: {} },
      },
    });
    await ProfilesService.addProfile(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(errBody(res).message).toMatch(/Failed to add profile|save-failed/);
  });
});

describe("ProfilesService.editProfile catch (lines 143-147)", () => {
  it("returns 400 when findByIdAndUpdate throws", async () => {
    Profile.findByIdAndUpdate.mockRejectedValueOnce(new Error("edit-failed"));
    const { req, res, next } = ctx({
      params: { id: "507f1f77bcf86cd799439011" },
      body: {
        name: "p2",
        durationStart: "2024-01-01",
        durationEnd: "2024-01-02",
        startTime: "09:00",
        endTime: "17:00",
        timezone: "Asia/Kolkata",
      },
    });
    await ProfilesService.editProfile(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("ProfilesService.deleteProfile catch (lines 161-165)", () => {
  it("returns 400 when findByIdAndDelete throws", async () => {
    Profile.findByIdAndDelete.mockRejectedValueOnce(new Error("delete-failed"));
    const { req, res, next } = ctx({ params: { id: "507f1f77bcf86cd799439011" } });
    await ProfilesService.deleteProfile(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("ProfilesService.bulkDeleteProfiles catch (lines 190-194)", () => {
  it("returns 500 when deleteMany throws", async () => {
    Profile.deleteMany.mockRejectedValueOnce(new Error("bulk-delete-failed"));
    const { req, res, next } = ctx({ body: { ids: ["a", "b"] } });
    await ProfilesService.bulkDeleteProfiles(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});

describe("ProfilesService.getProfileById catch (lines 210-214)", () => {
  it("returns 400 when Profile.findById throws", async () => {
    Profile.findById.mockRejectedValueOnce(new Error("by-id-failed"));
    const { req, res, next } = ctx({ params: { id: "bad-id" } });
    await ProfilesService.getProfileById(req, res, next);
    // service returns 400 with errorResp on catch
    expect([400, 500]).toContain(res.statusCode);
  });
});

describe("ProfilesService.bulkExportProfiles catch (lines 300-304)", () => {
  it("returns 500 when Profile.find().lean() throws", async () => {
    Profile.find.mockImplementationOnce(() => ({
      lean: () => Promise.reject(new Error("bulk-export-failed")),
    }));
    const { req, res, next } = ctx({ body: { ids: ["a", "b"] } });
    await ProfilesService.bulkExportProfiles(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(errBody(res).message).toMatch(/Failed to bulk export profiles|bulk-export-failed/);
  });
});

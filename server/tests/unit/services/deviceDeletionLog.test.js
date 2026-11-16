import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../core/v1/admin/admin.model.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../utils/logger.js", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: logger } = await import("../../../utils/logger.js");
const { logDeviceDeletion, resolveDeletionAccount } = await import("../../../services/deviceDeletionLog.service.js");
const lean = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  lean.mockReset().mockResolvedValue({ name_f: "Harish", name_l: "Gowda", login: "harish" });
  Admin.findOne.mockReturnValue({ select: () => ({ lean }) });
});

describe("device deletion audit messages", () => {
  it("resolves the owning account and logs the NVR name and both identifiers", async () => {
    await logDeviceDeletion("NVR", { _id: "nvr-1", nvrName: "Warehouse NVR", userId: "34" });
    expect(Admin.findOne).toHaveBeenCalledWith({ user_id: "34" });
    expect(logger.info).toHaveBeenCalledWith('[DEVICE-DELETE] NVR "Warehouse NVR" (id: nvr-1) deleted from account "Harish Gowda" (userId: 34). Historical logs and incidents retained.');
  });

  it("uses a camera's custom name and reuses the parent NVR's account lookup", async () => {
    const account = await resolveDeletionAccount("34");
    await logDeviceDeletion("Camera", { _id: "cam-1", name: "Camera 1", customName: "Main Entrance" }, account);
    await logDeviceDeletion("Camera", { _id: "cam-2", name: "Parking" }, account);
    expect(Admin.findOne).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toContain('Camera "Main Entrance" (id: cam-1) deleted from account "Harish Gowda"');
    expect(logger.info.mock.calls[1][0]).toContain('Camera "Parking" (id: cam-2) deleted from account "Harish Gowda"');
  });

  it("falls back to account login when its display name is empty", async () => {
    lean.mockResolvedValue({ name_f: "", name_l: "", login: "harish" });
    await logDeviceDeletion("Camera", { _id: "cam-1", name: "Entrance", userId: "34" });
    expect(logger.info.mock.calls[0][0]).toContain('account "harish" (userId: 34)');
  });

  it("still records the deletion with the owner ID if the account lookup fails", async () => {
    lean.mockRejectedValue(new Error("Database unavailable"));
    await expect(logDeviceDeletion("Camera", { _id: "cam-1", userId: "34" })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.info.mock.calls[0][0]).toContain('Camera "cam-1" (id: cam-1) deleted from account "34" (userId: 34)');
  });

  it("escapes name newlines so each deletion occupies one log line", async () => {
    await logDeviceDeletion("NVR", { _id: "nvr-1", nvrName: "Warehouse\nNVR", userId: "34" });
    expect(logger.info.mock.calls[0][0]).not.toContain("\n");
    expect(logger.info.mock.calls[0][0]).toContain('"Warehouse\\nNVR"');
  });
});

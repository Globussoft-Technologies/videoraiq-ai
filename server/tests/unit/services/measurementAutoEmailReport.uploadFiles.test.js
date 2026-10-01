import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../core/v2/adminStorage/mediaStorage.v2.js", () => ({
  putMediaV2: vi.fn(async ({ adminId, mediaType, folderName, originalName }) =>
    `/v2/${adminId}/admin/aws/uploads/${mediaType}s/${folderName}/${originalName}`),
}));

const { putMediaV2 } = await import("../../../core/v2/adminStorage/mediaStorage.v2.js");
const { uploadFiles } = await import(
  "../../../core/v2/measurementAutoEmailReport/measurementAutoEmailReport.service.js"
);

describe("measurementAutoEmailReport.uploadFiles", () => {
  beforeEach(() => {
    putMediaV2.mockClear();
  });

  it("uploads every generated report through the admin-specific storage provider", async () => {
    const report = { adminId: "68d2870d2d7a77a3a4e8e78c" };
    const files = await uploadFiles(report, {
      pdf: Buffer.from("pdf"),
      csv: Buffer.from("csv"),
      xlsx: Buffer.from("xlsx"),
    });

    expect(files.map(({ format }) => format)).toEqual(["pdf", "csv", "xlsx"]);
    expect(putMediaV2).toHaveBeenCalledTimes(3);
    for (const [options] of putMediaV2.mock.calls) {
      expect(options).toEqual(expect.objectContaining({
        adminId: report.adminId,
        mediaType: "report",
        folderName: report.adminId,
      }));
    }
    expect(files.every(({ path }) => path.includes(`/v2/${report.adminId}/admin/aws/`))).toBe(true);
  });

  it("does not call storage for an omitted report format", async () => {
    const report = { adminId: "68d2870d2d7a77a3a4e8e78c" };
    const files = await uploadFiles(report, { pdf: Buffer.from("pdf"), csv: null });

    expect(files).toHaveLength(1);
    expect(files[0].format).toBe("pdf");
    expect(putMediaV2).toHaveBeenCalledTimes(1);
  });
});

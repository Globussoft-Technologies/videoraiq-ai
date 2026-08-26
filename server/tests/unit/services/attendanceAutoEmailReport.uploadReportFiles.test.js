/**
 * Unit tests for AttendanceAutoEmailReport's upload-and-link delivery path.
 *
 * Reports are no longer emailed as attachments (which hit SendGrid's ~30MB
 * message cap on large date ranges/orgs) — the generated PDF/CSV are instead
 * uploaded to whichever media backend this deployment runs (mediaStorage.js:
 * NAS over SFTP or Oracle Object Storage, switched by one config flag) and
 * the email links to them instead. putMedia is mocked here so this test
 * doesn't need a real SFTP/Oracle connection; it verifies the shape of what
 * uploadReportFiles/publicUrlFor produce, not the storage backend itself
 * (which mediaStorage.js's own responsibility to get right).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../utils/mediaStorage.js", () => ({
  putMedia: vi.fn(async ({ mediaType, folderName, originalName }) => `/uploads/${mediaType}s/${folderName}/123-${originalName}`),
}));

const { putMedia } = await import("../../../utils/mediaStorage.js");
const { uploadReportFiles, publicUrlFor } = await import(
  "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js"
);

const report = { title: "Email Test", adminId: "64b000000000000000000001" };

describe("attendanceAutoEmailReport.uploadReportFiles", () => {
  it("uploads both PDF and CSV via putMedia with mediaType 'report' and returns path + public url for each", async () => {
    const csv = Buffer.from("date,name\r\n", "utf8");
    const pdf = Buffer.from("%PDF-fake", "utf8");
    const files = await uploadReportFiles(report, csv, pdf);

    expect(files).toHaveLength(2);
    const byFormat = Object.fromEntries(files.map((f) => [f.format, f]));
    expect(byFormat.pdf.path).toContain("uploads/reports/");
    expect(byFormat.csv.path).toContain("uploads/reports/");
    expect(byFormat.pdf.url).toBe(publicUrlFor(byFormat.pdf.path));
    expect(byFormat.csv.url).toBe(publicUrlFor(byFormat.csv.path));

    expect(putMedia).toHaveBeenCalledTimes(2);
    for (const call of putMedia.mock.calls) {
      expect(call[0].mediaType).toBe("report");
      expect(call[0].folderName).toBe(String(report.adminId));
    }
  });

  it("uploads only the requested format when the other buffer is null", async () => {
    putMedia.mockClear();
    const files = await uploadReportFiles(report, null, Buffer.from("%PDF-fake"));
    expect(files).toHaveLength(1);
    expect(files[0].format).toBe("pdf");
    expect(putMedia).toHaveBeenCalledTimes(1);
  });

  it("returns no files when neither format was requested", async () => {
    putMedia.mockClear();
    const files = await uploadReportFiles(report, null, null);
    expect(files).toEqual([]);
    expect(putMedia).not.toHaveBeenCalled();
  });
});

describe("attendanceAutoEmailReport.publicUrlFor", () => {
  it("prepends the configured ImageView base to a relative storage path", () => {
    const url = publicUrlFor("/uploads/reports/abc/file.pdf");
    expect(url.endsWith("/uploads/reports/abc/file.pdf")).toBe(true);
    expect(url.startsWith("http")).toBe(true);
  });

  it("handles a storage path without a leading slash the same way", () => {
    const withSlash = publicUrlFor("/uploads/reports/abc/file.pdf");
    const withoutSlash = publicUrlFor("uploads/reports/abc/file.pdf");
    expect(withoutSlash).toBe(withSlash);
  });
});

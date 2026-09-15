/**
 * Unit tests for AttendanceAutoEmailReport's upload-and-link delivery path.
 *
 * Reports are no longer emailed as attachments (which hit SendGrid's ~30MB
 * message cap on large date ranges/orgs) — the generated PDF/CSV are instead
 * uploaded to whichever per-admin media backend this deployment runs and
 * the email links to them instead. putMedia is mocked here so this test
 * doesn't need a real SFTP/Oracle connection; it verifies the shape of what
 * uploadReportFiles/publicUrlFor produce, not the storage backend itself
 * (which mediaStorage.js's own responsibility to get right).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../core/v2/adminStorage/mediaStorage.v2.js", () => ({
  putMediaV2: vi.fn(async ({ adminId, mediaType, folderName, originalName }) =>
    `/v2/${adminId}/env/nas/uploads/${mediaType}s/${folderName}/123-${originalName}`),
}));

const { putMediaV2: putMedia } = await import("../../../core/v2/adminStorage/mediaStorage.v2.js");
const { uploadReportFiles, publicUrlFor } = await import(
  "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js"
);

const report = { title: "Email Test", adminId: "64b000000000000000000001" };

describe("attendanceAutoEmailReport.uploadReportFiles", () => {
  it("uploads PDF, CSV and XLSX via putMedia with mediaType 'report' and returns path + public url for each", async () => {
    const csv = Buffer.from("date,name\r\n", "utf8");
    const pdf = Buffer.from("%PDF-fake", "utf8");
    const xlsx = Buffer.from("xlsx-fake", "utf8");
    const files = await uploadReportFiles(report, csv, pdf, xlsx);

    expect(files).toHaveLength(3);
    const byFormat = Object.fromEntries(files.map((f) => [f.format, f]));
    expect(byFormat.pdf.path).toContain("uploads/reports/");
    expect(byFormat.csv.path).toContain("uploads/reports/");
    expect(byFormat.xlsx.path).toContain("uploads/reports/");
    expect(byFormat.pdf.url).toBe(`${publicUrlFor(byFormat.pdf.path)}?download=attendance-report.pdf`);
    expect(byFormat.csv.url).toBe(`${publicUrlFor(byFormat.csv.path)}?download=attendance-report.csv`);
    expect(byFormat.xlsx.url).toBe(`${publicUrlFor(byFormat.xlsx.path)}?download=attendance-report.xlsx`);

    expect(putMedia).toHaveBeenCalledTimes(3);
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

  it.each(["nas", "aws", "gcp", "oracle"])(
    "routes a V2 %s storage key through the provider-neutral V2 upload endpoint",
    (provider) => {
    const url = publicUrlFor(
      `/v2/64b000000000000000000001/env/${provider}/uploads/reports/abc/file.pdf`,
    );
    expect(url).toContain(
      `/api/v2/uploads/v2/64b000000000000000000001/env/${provider}/uploads/reports/abc/file.pdf`,
    );
    expect(url).not.toContain("/api/v1/uploads/v2/");
    },
  );
});

import { describe, expect, it, vi } from "vitest";
import { serviceCtx } from "../../helpers/service.js";

const storageMocks = vi.hoisted(() => ({
  streamMediaV2: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../core/v2/adminStorage/mediaStorage.v2.js", () => ({
  streamMediaV2: storageMocks.streamMediaV2,
}));

const { default: UploadService } = await import(
  "../../../core/v1/Uploads/uploads.service.js"
);

describe("V1 upload URL compatibility with V2 storage keys", () => {
  const cases = ["nas", "aws", "gcp", "oracle"].flatMap((provider) => [
    [provider, "pdf", "application/pdf"],
    [provider, "csv", "text/csv"],
    [provider, "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ]);

  it.each(cases)("routes a %s auto-email %s report through the V2-compatible reader", async (provider, extension, contentType) => {
    const mediaPath =
      `/v2/69ce6a00d5b1b9d2ca5003b2/env/${provider}/uploads/reports/` +
      `69ce6a00d5b1b9d2ca5003b2/1789455828021-id-attendance-report.${extension}`;
    const { req, res } = serviceCtx({
      params: { mediaPath: encodeURIComponent(mediaPath) },
      query: { download: `attendance-report.${extension}` },
    });

    await UploadService.fetchMedia(req, res);

    expect(storageMocks.streamMediaV2).toHaveBeenCalledWith(mediaPath, res);
    expect(res._headers["Content-Type"]).toBe(contentType);
    expect(res._headers["Content-Disposition"]).toContain(
      `filename="attendance-report.${extension}"`,
    );
  });
});

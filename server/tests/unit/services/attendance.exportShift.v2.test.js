import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

vi.mock("../../../socket.js", () => ({ sendPayloadToUser: vi.fn() }));
vi.mock("../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildPdf: vi.fn(actual.buildPdf), buildCsv: vi.fn(actual.buildCsv) };
});

const { default: service } = await import("../../../core/v2/attendance/attendance.service.js");
const { default: Attendance } = await import("../../../core/v2/attendance/attendance.model.js");
const { default: Settings } = await import("../../../core/v2/attendance/attendanceSettings.model.js");
const { buildPdf, buildCsv, reportTableRows, REPORT_HEADERS } = await import(
  "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js"
);

afterEach(() => {
  vi.restoreAllMocks();
  buildPdf.mockClear();
  buildCsv.mockClear();
});

describe.each(["csv", "pdf"])("attendance %s export assigned shift", (format) => {
  it.each([
    [{ name: "General Shift", startTime: "09:00", endTime: "18:00" }, "General Shift", "09:00 - 18:00"],
    [{ name: "Night Shift", startTime: "21:00", endTime: "06:00", isNightShift: true }, "Night Shift", "21:00 - 06:00 (night)"],
    [null, "-", "-"],
  ])("renders the resolved shift %j from the grouped query", async (shift, name, timings) => {
    const doc = {
      _id: { date: "2026-10-28" },
      employee: { _id: "employee-1", firstName: "Test", emp_id: "969", shiftId: shift ? "shift-reference" : null },
      shift,
      events: [
        { cameraType: "checkin", timestamp: "2026-10-28T04:00:00Z", images: {} },
        { cameraType: "checkout", timestamp: "2026-10-28T12:00:00Z", images: {} },
      ],
    };
    vi.spyOn(service, "buildAttendancePipeline").mockResolvedValue({ pipeline: [] });
    vi.spyOn(Attendance, "aggregate").mockReturnValue({ collation: vi.fn().mockResolvedValue([doc]) });
    vi.spyOn(Settings, "findOne").mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    // Report branding is unrelated to export data; never fetch it over the network.
    vi.spyOn(axios, "get").mockRejectedValue(new Error("No logo in tests"));
    const req = { query: { format }, verified: { userData: { adminId: "admin-1", timezone: "Asia/Kolkata" } } };
    const res = { setHeader: vi.fn(), end: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };

    await service.exportAttendance(req, res);

    const builder = format === "pdf" ? buildPdf : buildCsv;
    expect(builder).toHaveBeenCalledOnce();
    const rows = builder.mock.calls[0][0].rows;
    const cells = reportTableRows(rows)[0].cells;
    expect(cells[REPORT_HEADERS.indexOf("Shift Name")]).toBe(name);
    expect(cells[REPORT_HEADERS.indexOf("Shift Timings")]).toBe(timings);
    expect(doc.employee.shiftId).toBe(shift ? "shift-reference" : null);
    expect(res.json).not.toHaveBeenCalled();
    const buffer = res.end.mock.calls[0][0];
    if (format === "pdf") {
      expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    } else {
      const csv = buffer.toString("utf8");
      expect(csv).toContain("Shift Name,Shift Timings");
      if (shift) {
        expect(csv).toContain(name);
        expect(csv).toContain(timings);
      }
    }
  });
});

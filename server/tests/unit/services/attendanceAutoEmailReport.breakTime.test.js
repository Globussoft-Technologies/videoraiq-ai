/**
 * Unit tests for the per-session "Break Time" column on the PDF/CSV report.
 *
 * The report already reported a day's total break; what this column adds is
 * WHICH break. Each work session shows the gap immediately before it — the time
 * between the previous check-out and this session's check-in — so a day with
 * several breaks shows each one against the session it preceded rather than
 * only their sum.
 *
 * Two invariants are worth protecting:
 *   - the per-session gaps must add up to the day total reported beside them,
 *     since both are derived from the same events by two different pairings;
 *   - the first session of the day has nothing before it, so it must read "-"
 *     and never a 00:00 that looks like a measured zero-length break.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../utils/mediaStorage.js", () => ({
  putMedia: vi.fn(async () => "/uploads/reports/1/x"),
}));

const { reportTableRows, rowFromAttendance, buildCsv, REPORT_HEADERS } = await import(
  "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js"
);

const rules = { fullDayHours: 8, halfDayHours: 4 };
const TZ = "UTC";

const ev = (cameraType, time) => ({
  cameraType,
  timestamp: `2026-08-07T${time}:00.000Z`,
  images: {},
});

function attendance(events) {
  return {
    createdAt: "2026-08-07T04:00:00.000Z",
    employee: { _id: "e1", firstName: "Nagul", lastName: "Lingiri", emp_id: "1460206", shiftId: null },
    events,
  };
}

const at = (cells, header) => cells[REPORT_HEADERS.indexOf(header)];
const linesFor = (events) => reportTableRows([rowFromAttendance(attendance(events), TZ, rules)]);

/** "HH:MM" -> minutes, for checking the parts sum to the whole. */
function toMinutes(text) {
  const [h, m] = String(text).split(":").map(Number);
  return h * 60 + m;
}

describe("attendanceAutoEmailReport per-session break time", () => {
  it("exposes the column right after the day's working-hours total", () => {
    const breakTime = REPORT_HEADERS.indexOf("Break Time");
    expect(breakTime).toBeGreaterThan(-1);
    expect(REPORT_HEADERS[breakTime - 1]).toBe("Total Working Hours for the Day");
  });

  it("shows each session's own preceding gap, computed from check-out to check-in", () => {
    // 10:00-12:00 worked | away 1h | 13:00-15:30 worked | away 30m | 16:00-18:00 worked
    const out = linesFor([
      ev("checkin", "10:00"), ev("checkout", "12:00"),
      ev("checkin", "13:00"), ev("checkout", "15:30"),
      ev("checkin", "16:00"), ev("checkout", "18:00"),
    ]);
    expect(out.map((line) => line.kind)).toEqual(["day", "session", "session", "total"]);
    expect(at(out[1].cells, "Break Time")).toBe("01:00"); // 12:00 -> 13:00
    expect(at(out[2].cells, "Break Time")).toBe("00:30"); // 15:30 -> 16:00
  });

  it("reads '-' on the day line, whose session is the first of the day", () => {
    const out = linesFor([
      ev("checkin", "10:00"), ev("checkout", "12:00"),
      ev("checkin", "13:00"), ev("checkout", "18:00"),
    ]);
    // Not "00:00" — nothing preceded the first check-in, so there is no
    // break to report rather than a break measured as zero.
    expect(at(out[0].cells, "Break Time")).toBe("-");
  });

  it("leaves the column blank on the total line, where the day's sum is reported", () => {
    const out = linesFor([
      ev("checkin", "10:00"), ev("checkout", "12:00"),
      ev("checkin", "13:00"), ev("checkout", "18:00"),
    ]);
    const total = out.at(-1).cells;
    expect(at(total, "Break Time")).toBe("");
    expect(at(total, "Total Break Hours for the Day")).toBe("01:00");
  });

  it("per-session gaps add up to the day total reported beside them", () => {
    const out = linesFor([
      ev("checkin", "10:00"), ev("checkout", "12:00"),
      ev("checkin", "13:00"), ev("checkout", "15:30"),
      ev("checkin", "16:00"), ev("checkout", "18:00"),
    ]);
    const perSession = out
      .filter((line) => line.kind === "session")
      .map((line) => toMinutes(at(line.cells, "Break Time")));
    const dayTotal = toMinutes(at(out.at(-1).cells, "Total Break Hours for the Day"));
    expect(perSession.reduce((sum, value) => sum + value, 0)).toBe(dayTotal);
    expect(dayTotal).toBe(90); // 60 + 30
  });

  it("reports no break for a day worked in a single unbroken session", () => {
    const out = linesFor([ev("checkin", "09:00"), ev("checkout", "17:00")]);
    expect(out.map((line) => line.kind)).toEqual(["day", "total"]);
    expect(at(out[0].cells, "Break Time")).toBe("-");
    expect(at(out.at(-1).cells, "Total Break Hours for the Day")).toBe("00:00");
  });

  it("does not count the gap before a trailing check-in that never checked out", () => {
    // Checked back in at 16:00 and never checked out: the 30m gap before it is
    // still a real break and is reported, but the open session adds no worked
    // time — the two figures stay independent.
    const out = linesFor([
      ev("checkin", "10:00"), ev("checkout", "15:30"), ev("checkin", "16:00"),
    ]);
    const session = out.find((line) => line.kind === "session");
    expect(at(session.cells, "Break Time")).toBe("00:30");
    expect(at(session.cells, "Check out")).toBe("-");
  });

  it("writes the column into the CSV header in the right position", () => {
    const row = rowFromAttendance(
      attendance([
        ev("checkin", "10:00"), ev("checkout", "12:00"),
        ev("checkin", "13:00"), ev("checkout", "18:00"),
      ]),
      TZ,
      rules,
    );
    const csv = buildCsv({ report: {}, rows: [row], label: "Aug 2026", timezone: TZ }).toString("utf8");
    const header = csv.split("\r\n").find((line) => line.startsWith("ID,"));
    expect(header).toContain("Total Working Hours for the Day,Break Time,Total Break Hours for the Day");
  });
});

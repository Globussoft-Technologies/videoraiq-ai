/**
 * The PDF/CSV render each employee-day as: a "day" line (identity + first
 * check-in / last check-out / gross duration + period total), one "session"
 * line per check-in/check-out pair (each with its own worked duration and
 * snapshot link), then a "total" line (the day's Total Working Hrs + Total
 * Break Hrs + the period total), and finally one report-wide "grand" line.
 * This verifies the expansion, the aggregates and that buildCsv/buildPdf still
 * produce valid output.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../utils/mediaStorage.js", () => ({ putMedia: vi.fn() }));

const { reportTableRows, rowFromAttendance, buildCsv, buildPdf } = await import(
  "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js"
);

const rules = { fullDayHours: 8, halfDayHours: 4 };

function attendance(events) {
  return {
    createdAt: "2026-08-07T04:00:00.000Z",
    employee: { _id: "e1", firstName: "Nagul", lastName: "Lingiri", emp_id: "1", location: "india" },
    events,
  };
}

const ev = (cameraType, time) => ({ cameraType, timestamp: `2026-08-07T${time}:00.000Z`, images: { frame: `/f/${time}.jpg` } });

describe("attendanceAutoEmailReport session sub-rows", () => {
  it("pairs each check-in with the next check-out into a session with its own duration", () => {
    const row = rowFromAttendance(
      attendance([ev("checkin", "10:00"), ev("checkout", "10:30"), ev("checkin", "11:00"), ev("checkout", "12:15")]),
      "Asia/Kolkata",
      rules
    );
    expect(row.sessions).toHaveLength(2);
    expect(row.sessions[0].duration).toBe("00:30:00");
    expect(row.sessions[1].duration).toBe("01:15:00");
    expect(row.sessions[0].checkInImage).toContain("/f/10:00.jpg");
  });

  it("keeps a trailing check-in with no check-out as an open (00:00:00) session", () => {
    const row = rowFromAttendance(
      attendance([ev("checkin", "09:00"), ev("checkout", "09:45"), ev("checkin", "10:00")]),
      "Asia/Kolkata",
      rules
    );
    expect(row.sessions).toHaveLength(2);
    expect(row.sessions[1].checkOut).toBe("-");
    expect(row.sessions[1].duration).toBe("00:00:00");
  });

  it("expands one employee-day into: day line + N session lines + total line", () => {
    const row = rowFromAttendance(
      attendance([ev("checkin", "10:00"), ev("checkout", "10:30"), ev("checkin", "11:00"), ev("checkout", "12:15")]),
      "Asia/Kolkata",
      rules
    );
    row.workingHoursDay = "01:45:00";
    row.breakHoursDay = "00:30:00";
    row.workingHoursPeriod = "01:45:00";
    row.workingMinutesDay = 105;
    row.breakMinutesDay = 30;
    row.workingMinutesPeriod = 105;

    const out = reportTableRows([row]);
    expect(out.map((r) => r.kind)).toEqual(["day", "session", "session", "total", "grand"]);

    // Day line: id + name + span. Period total now lives on the total line.
    const day = out[0].cells;
    expect(day[0]).toBe("1");
    expect(day[1]).toBe("Nagul Lingiri");
    expect(day[5]).toBe(row.checkIn);   // first check-in of the day
    expect(day[6]).toBe(row.checkOut);  // last check-out of the day
    expect(day[10]).toBe("");           // period total moved to the total line
    expect(day[8]).toBe("");            // day working total lives on the total line

    // Session lines: no identity, own duration.
    expect(out[1].cells[1]).toBe("");
    expect(out[1].cells[7]).toBe("00:30:00");
    expect(out[2].cells[7]).toBe("01:15:00");

    // Total line: day working + break + the period total.
    const total = out[3].cells;
    expect(total[8]).toBe("01:45:00");
    expect(total[9]).toBe("00:30:00");
    expect(total[10]).toBe("01:45:00");

    // Grand line: report-wide totals.
    const grand = out[4].cells;
    expect(grand[1]).toBe("TOTAL (all employees)");
    expect(grand[8]).toBe("01:45:00");
    expect(grand[9]).toBe("00:30:00");
    expect(grand[10]).toBe("01:45:00");
  });

  it("still emits a day + single session + total block when the day has one session", () => {
    const row = rowFromAttendance(attendance([ev("checkin", "09:00"), ev("checkout", "17:00")]), "Asia/Kolkata", rules);
    const out = reportTableRows([row]);
    expect(out.map((r) => r.kind)).toEqual(["day", "session", "total", "grand"]);
  });

  it("sums each employee's period total once across the grand line", () => {
    const a1 = rowFromAttendance(attendance([ev("checkin", "09:00"), ev("checkout", "17:00")]), "Asia/Kolkata", rules);
    const a2 = rowFromAttendance(attendance([ev("checkin", "09:00"), ev("checkout", "13:00")]), "Asia/Kolkata", rules);
    // Same employee, two days — 8h + 4h worked, one 12h period total.
    a1.workingMinutesDay = 480; a1.breakMinutesDay = 0; a1.workingMinutesPeriod = 720;
    a2.workingMinutesDay = 240; a2.breakMinutesDay = 0; a2.workingMinutesPeriod = 720;
    const out = reportTableRows([a1, a2]);
    const grand = out.at(-1);
    expect(grand.kind).toBe("grand");
    expect(grand.cells[8]).toBe("12:00:00");  // 480 + 240 worked minutes
    expect(grand.cells[10]).toBe("12:00:00"); // 720 period counted once, not 1440
  });

  it("buildCsv emits day + session + total lines with a HYPERLINK image cell", () => {
    const row = rowFromAttendance(
      attendance([ev("checkin", "10:00"), ev("checkout", "10:30"), ev("checkin", "11:00"), ev("checkout", "12:15")]),
      "Asia/Kolkata",
      rules
    );
    const csv = buildCsv({ report: {}, rows: [row], label: "07 Aug 2026", timezone: "Asia/Kolkata" }).toString("utf8");
    const lines = csv.split("\r\n");
    // 6 meta lines + day + 2 sessions + total + grand
    expect(lines).toHaveLength(11);
    expect(csv).toContain("=HYPERLINK(");
  });

  it("formats a session/day duration over 24h as a d/h/m breakdown, not HH:MM:SS", () => {
    // check-in Fri 10:00, check-out Sun 13:40 → 51h 40m
    const row = rowFromAttendance(
      {
        createdAt: "2026-08-07T04:00:00.000Z",
        employee: { _id: "e1", firstName: "Long", lastName: "Shift", emp_id: "9" },
        events: [
          { cameraType: "checkin", timestamp: "2026-08-07T10:00:00.000Z" },
          { cameraType: "checkout", timestamp: "2026-08-09T13:40:00.000Z" },
        ],
      },
      "Asia/Kolkata",
      rules
    );
    expect(row.sessions[0].duration).toBe("2d 3h 40m");
    expect(row.duration).toBe("2d 3h 40m");
    expect(row.workingHoursDay).toBe("2d 3h 40m");
  });

  it("keeps sub-24h durations as HH:MM:SS", () => {
    const row = rowFromAttendance(attendance([ev("checkin", "09:00"), ev("checkout", "17:30")]), "Asia/Kolkata", rules);
    expect(row.sessions[0].duration).toBe("08:30:00");
    expect(row.workingHoursDay).toBe("08:30:00");
  });

  it("buildPdf produces a valid PDF buffer over the expanded rows", async () => {
    const row = rowFromAttendance(attendance([ev("checkin", "10:00"), ev("checkout", "10:30")]), "Asia/Kolkata", rules);
    const pdf = await buildPdf({ report: {}, rows: [row], label: "07 Aug 2026", timezone: "Asia/Kolkata" });
    expect(pdf.slice(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);
  });
});

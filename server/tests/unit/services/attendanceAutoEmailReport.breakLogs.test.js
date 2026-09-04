/**
 * Unit tests for the Break Logs report (breakLogReport.js).
 *
 * This report inverts the attendance report's unit: a row is one BREAK, not one
 * work session. That makes three things worth pinning down:
 *   - a break's out/in times come from the check-OUT that started it and the
 *     check-IN that ended it, so they must not be read back to front;
 *   - each employee-day is closed by a subtotal line, and the individual break
 *     durations must add up to it;
 *   - a day on which nobody took a break still has to appear, otherwise "took
 *     no breaks" and "missing from the report" look identical to the reader.
 */
import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("../../../utils/mediaStorage.js", () => ({
  putMedia: vi.fn(async () => "/uploads/reports/1/x"),
}));

const { rowFromAttendance } = await import(
  "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js"
);
const { breakTableRows, buildBreakCsv, buildBreakPdf, buildBreakWorkbook, BREAK_HEADERS } = await import(
  "../../../core/v2/attendanceAutoEmailReport/breakLogReport.js"
);

const TZ = "UTC";
const rules = { fullDayHours: 8, halfDayHours: 4 };
const SHIFT = { name: "morning shift", startTime: "10:00", endTime: "19:00", isNightShift: false };

const ev = (cameraType, time, camera) => ({
  cameraType,
  timestamp: `2026-08-07T${time}:00.000Z`,
  images: { frame: `/f/${time}.jpg` },
  channel: { name: camera },
});

function row(events, day = "07") {
  return rowFromAttendance(
    {
      createdAt: `2026-08-${day}T04:00:00.000Z`,
      employee: {
        _id: "e1",
        firstName: "Chethan",
        lastName: "S",
        emp_id: "103198",
        departmentId: { departmentName: "software development" },
        location: "bangalore",
        shiftId: SHIFT,
      },
      events,
    },
    TZ,
    rules,
  );
}

/** Read a cell by column name; image cells arrive as { text, link }. */
const at = (cells, header) => {
  const value = cells[BREAK_HEADERS.indexOf(header)];
  return value && typeof value === "object" ? value.text : value;
};

/** Two breaks: 12:00-13:00 (1h) and 15:30-16:00 (30m). */
const TWO_BREAKS = [
  ev("checkin", "10:00", "Entry Cam"), ev("checkout", "12:00", "Exit Cam"),
  ev("checkin", "13:00", "Entry Cam"), ev("checkout", "15:30", "Exit Cam"),
  ev("checkin", "16:00", "Entry Cam"), ev("checkout", "19:00", "Exit Cam"),
];

const toMinutes = (text) => {
  const [h, m] = String(text).split(":").map(Number);
  return h * 60 + m;
};

describe("breakLogReport — columns", () => {
  it("carries every requested column, in order", () => {
    expect(BREAK_HEADERS).toEqual([
      "ID", "Emp. Code", "Name", "Department", "Shift", "Shift Timings", "Date", "Location",
      "Break #", "Break Out", "Break In", "Break Time", "Total Break Time",
      "Break Out Camera", "Break In Camera", "View Image",
    ]);
  });

  it("fills the identity columns from the employee and their shift", () => {
    const line = breakTableRows([row(TWO_BREAKS)])[0].cells;
    expect(at(line, "Emp. Code")).toBe("103198");
    expect(at(line, "Name")).toBe("Chethan S");
    expect(at(line, "Department")).toBe("software development");
    expect(at(line, "Shift")).toBe("morning shift");
    expect(at(line, "Shift Timings")).toBe("10:00 - 19:00");
    expect(at(line, "Date")).toBe("07 Aug 2026");
    expect(at(line, "Location")).toBe("bangalore");
  });
});

describe("breakLogReport — one row per break", () => {
  it("emits a row per break, then a subtotal line closing the day", () => {
    const out = breakTableRows([row(TWO_BREAKS)]);
    expect(out.map((line) => line.kind)).toEqual(["break", "break", "total"]);
  });

  it("takes each break's start from the check-out and its end from the check-in", () => {
    const out = breakTableRows([row(TWO_BREAKS)]);
    // Break 1 began when they checked OUT at 12:00 and ended on the 13:00 check-in.
    expect(at(out[0].cells, "Break Out")).toBe("12:00:00 PM");
    expect(at(out[0].cells, "Break In")).toBe("01:00:00 PM");
    expect(at(out[0].cells, "Break Time")).toBe("01:00");
    expect(at(out[1].cells, "Break Out")).toBe("03:30:00 PM");
    expect(at(out[1].cells, "Break In")).toBe("04:00:00 PM");
    expect(at(out[1].cells, "Break Time")).toBe("00:30");
  });

  it("numbers the breaks within each day", () => {
    const out = breakTableRows([row(TWO_BREAKS)]);
    expect(at(out[0].cells, "Break #")).toBe("1");
    expect(at(out[1].cells, "Break #")).toBe("2");
  });

  it("names the camera at each end of the break", () => {
    const line = breakTableRows([row(TWO_BREAKS)])[0].cells;
    expect(at(line, "Break Out Camera")).toBe("Exit Cam");
    expect(at(line, "Break In Camera")).toBe("Entry Cam");
  });

  it("links a snapshot for each break", () => {
    const cells = breakTableRows([row(TWO_BREAKS)])[0].cells;
    const image = cells[BREAK_HEADERS.indexOf("View Image")];
    expect(image).toMatchObject({ text: "View Image" });
    expect(image.link).toContain("/f/12:00.jpg");
  });
});

describe("breakLogReport — totals", () => {
  it("reports the day's total only on the subtotal line, never repeated per row", () => {
    const out = breakTableRows([row(TWO_BREAKS)]);
    expect(at(out[0].cells, "Total Break Time")).toBe("");
    expect(at(out[1].cells, "Total Break Time")).toBe("");
    expect(at(out[2].cells, "Total Break Time")).toBe("01:30");
  });

  it("the per-break durations add up to the subtotal", () => {
    const out = breakTableRows([row(TWO_BREAKS)]);
    const parts = out
      .filter((line) => line.kind === "break")
      .map((line) => toMinutes(at(line.cells, "Break Time")));
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(
      toMinutes(at(out.at(-1).cells, "Total Break Time")),
    );
  });
});

describe("breakLogReport — days with no break", () => {
  it("still lists the employee-day, with dashes instead of break values", () => {
    const out = breakTableRows([row([ev("checkin", "10:00", "Entry Cam"), ev("checkout", "19:00", "Exit Cam")])]);
    // One line, and no subtotal — there is nothing to total.
    expect(out.map((line) => line.kind)).toEqual(["break"]);
    // The identity is still there, so the reader can see the day was covered.
    expect(at(out[0].cells, "Name")).toBe("Chethan S");
    for (const header of ["Break #", "Break Out", "Break In", "Break Time"]) {
      expect(at(out[0].cells, header)).toBe("-");
    }
  });

  it("mixes broken and unbroken days in one report", () => {
    const out = breakTableRows([
      row(TWO_BREAKS),
      row([ev("checkin", "10:00", "Entry Cam"), ev("checkout", "19:00", "Exit Cam")], "08"),
    ]);
    expect(out.map((line) => line.kind)).toEqual(["break", "break", "total", "break"]);
  });
});

describe("breakLogReport — output formats", () => {
  it("builds a valid PDF", async () => {
    const pdf = await buildBreakPdf({ report: {}, rows: [row(TWO_BREAKS)], label: "Aug 2026", timezone: TZ });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);
  });

  it("builds an .xlsx workbook whose cells match the rendered lines", async () => {
    const buffer = await buildBreakWorkbook({ rows: [row(TWO_BREAKS)], label: "Aug 2026", timezone: TZ });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Break Logs");
    expect(sheet).toBeDefined();
    // Header on row 4, first break on row 5.
    expect(sheet.getCell(4, BREAK_HEADERS.indexOf("Break Out") + 1).value).toBe("Break Out");
    expect(sheet.getCell(5, BREAK_HEADERS.indexOf("Break Time") + 1).value).toBe("01:00");
    expect(sheet.getCell(7, BREAK_HEADERS.indexOf("Total Break Time") + 1).value).toBe("01:30");
  });

  it("writes the columns into the CSV header", () => {
    const csv = buildBreakCsv({ rows: [row(TWO_BREAKS)], label: "Aug 2026", timezone: TZ }).toString("utf8");
    const header = csv.split("\r\n").find((line) => line.startsWith("ID,"));
    expect(header).toContain("Break Out,Break In,Break Time,Total Break Time");
  });

  it("renders an empty report without throwing", async () => {
    expect(breakTableRows([])).toEqual([]);
    const pdf = await buildBreakPdf({ report: {}, rows: [], label: "Aug 2026", timezone: TZ });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

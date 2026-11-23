export const ATTENDANCE_COLUMNS = [
  "S No", "Employee ID", "Employee Name", "Department", "Shift Name", "Shift Timings",
  "Date", "Location/Unit Number", "Check in", "Check out", "Duration",
  "Total Working Hours for the Day", "Break Time", "Total Break Hours for the Day",
  "Total Break Hours for the Selected Period", "Total Working Hours for the Selected Period",
  "Checkin Camera", "Checkout Camera", "Checkin Image", "Checkout Image", "Late Check-in", "Late By (minutes)",
];

export const BREAK_COLUMNS = [
  "S No", "Employee ID", "Employee Name", "Department", "Shift Name", "Shift Timings",
  "Date", "Location", "Break #", "Break Out", "Break In", "Break Time", "Total Break Time",
  "Break Out Camera", "Break In Camera", "View Image",
];

// Keep schema order and project headers and cells together, including image
// hyperlinks and subtotal lines. An empty selection means the complete table.
export function selectTableColumns(headers, lines, selected = []) {
  if (!selected?.length) return { headers, lines };
  const indices = headers.flatMap((header, index) => selected.includes(header) ? [index] : []);
  if (!indices.length) throw new Error("No valid report columns selected");
  return {
    headers: indices.map((index) => headers[index]),
    lines: lines.map((line) => ({ ...line, cells: indices.map((index) => line.cells[index]) })),
  };
}

export function formatLateDuration(minutes) {
  const seconds = Math.max(0, Math.round(minutes * 60));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, "0")).join(":");
}

// Apply only after selecting columns; saved selections still use the minutes header.
export function displayLateDurationTable(table) {
  const lateColumn = table.headers.indexOf("Late By (minutes)");
  if (lateColumn < 0) return table;
  return {
    headers: table.headers.map((header, index) => index === lateColumn ? "Late By (HH:mm:ss)" : header),
    lines: table.lines.map((line) => ({
      ...line,
      cells: line.cells.map((value, index) => index === lateColumn && Number.isFinite(value)
        ? formatLateDuration(value) : value),
    })),
  };
}

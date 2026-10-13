import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { inflateSync } from "node:zlib";
import Location from "../locations/location.model.js";
import Department from "../departments/departments.model.js";
import Shift, { DEFAULT_WORKING_WEEK, SHIFT_DAY_KEYS } from "../shifts/shifts.model.js";
import { extractConfigurationPdf } from "./assistant.provider.js";

const schemas = {
  location: { label: "Locations", columns: ["Location Name", "Employee Location ID"], required: ["Location Name"] },
  department: { label: "Departments", columns: ["Department Name", "Description", "Employee Department ID"], required: ["Department Name"] },
  shift: { label: "Shifts", columns: ["Shift Name", "Start Time", "End Time", "Break (min)", "Grace Late (min)", "Grace Early (min)", "Max Overtime (min)", "Night Shift", "Default Shift", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], required: ["Shift Name"] },
};

const canonical = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const values = (row) => row.values.slice(1).map((value) => value?.text ?? value ?? "");
const unescapePdfString = (value) => value
  .replace(/\\([()\\])/g, "$1")
  .replace(/\\(\d{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
  .replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\t/g, "\t");

function pdfTextTokens(buffer) {
  const source = buffer.toString("latin1");
  const streams = [source];
  // Text in normal exported PDFs is commonly inside Flate-compressed page
  // streams. Inspect those streams as well as any uncompressed PDF objects.
  for (const match of source.matchAll(/<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    if (!/\/FlateDecode\b/.test(match[1])) continue;
    try { streams.push(inflateSync(Buffer.from(match[2], "latin1")).toString("latin1")); } catch { /* Ignore non-deflate or corrupt streams. */ }
  }
  const tokens = [];
  for (const stream of streams) {
    for (const match of stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|<([0-9A-Fa-f]+)>\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g)) {
      const strings = match[3] !== undefined
        ? [...match[3].matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f]+)>/g)].map((part) => part[1] === undefined ? Buffer.from(part[2], "hex").toString("latin1") : unescapePdfString(part[1]))
        : [match[1] === undefined ? Buffer.from(match[2], "hex").toString("latin1") : unescapePdfString(match[1])];
      if (strings.length) tokens.push(strings.join(""));
    }
  }
  return tokens;
}

function rowsFromPdfTokens(tokens, schema) {
  // Locate the first occurrence of the required header(s), allowing PDF
  // generators to wrap a heading such as "Shift Name" over multiple text runs.
  let headerStart = -1;
  let headerEnd = -1;
  let headers = [];
  for (let start = 0; start < tokens.length && headerStart < 0; start += 1) {
    let cursor = start;
    const found = [];
    while (cursor < tokens.length) {
      let match = null;
      for (let end = cursor; end < Math.min(cursor + 4, tokens.length); end += 1) {
        const joined = canonical(tokens.slice(cursor, end + 1).join(""));
        const candidate = schema.columns.find((column) => canonical(column) === joined);
        if (candidate) { match = { candidate, end }; break; }
      }
      if (!match) break;
      found.push(match.candidate);
      cursor = match.end + 1;
    }
    if (schema.required.every((required) => found.includes(required))) {
      headerStart = start;
      headerEnd = cursor;
      headers = found;
    }
  }
  if (headerStart < 0) throw new Error(`Missing required column: ${schema.required.join(", ")}.`);
  const data = tokens.slice(headerEnd).filter((token) => token.trim());
  if (data.length < headers.length) throw new Error("The PDF has no data rows.");
  const rows = [];
  for (let offset = 0; offset + headers.length <= data.length; offset += headers.length) {
    const cells = data.slice(offset, offset + headers.length);
    // Ignore trailing page furniture or an incomplete final row.
    if (cells.length !== headers.length) break;
    rows.push({ number: rows.length + 2, get: (header) => {
      const position = headers.indexOf(header);
      return position < 0 ? "" : cells[position];
    } });
  }
  if (!rows.length) throw new Error("The PDF has no data rows.");
  return rows;
}
const bool = (value, field) => {
  if (value === "" || value === undefined) return false;
  if (/^(true|yes|1)$/i.test(String(value).trim())) return true;
  if (/^(false|no|0)$/i.test(String(value).trim())) return false;
  throw new Error(`${field} must be Yes or No.`);
};
const minutes = (value, field, fallback) => {
  if (value === "" || value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 1440) throw new Error(`${field} must be a whole number from 0 to 1440.`);
  return number;
};
const time = (value, field, fallback) => {
  if (value === "" || value === undefined) return fallback;
  const normalized = String(value).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) throw new Error(`${field} must use 24-hour HH:MM format.`);
  return normalized;
};

export function formatFor(kind) {
  const schema = schemas[kind];
  if (!schema) return null;
  const sample = { "Location Name": "Bangalore", "Employee Location ID": "BLR001", "Department Name": "Human Resources", Description: "Handles employee relations", "Employee Department ID": "101", "Shift Name": "General Shift", "Start Time": "09:00", "End Time": "18:00", "Break (min)": "60", "Grace Late (min)": "15", "Grace Early (min)": "15", "Max Overtime (min)": "0", "Night Shift": "No", "Default Shift": "Yes", Sunday: "off", Monday: "full", Tuesday: "full", Wednesday: "full", Thursday: "full", Friday: "full", Saturday: "off" };
  return { type: "config_import_format", resource: kind, title: `Correct ${schema.label} format`, columns: schema.columns, example: schema.columns.map((column) => sample[column] || "") };
}

export function templateRequestKinds(message) {
  const text = String(message || "").toLowerCase();
  // Form controls mention fields but do not request an import template.
  if (/^\s*(?:skip|continue|cancel|confirm|save)\b/.test(text)) return [];
  const asksForShape = /\b(?:templates?|templetes?|formats?|structures?|strcures?|strctures?|samples?|examples?|columns?|headers?|layouts?|schemas?|fields?)\b/.test(text)
    || /\b(?:sheet|file|spreadsheet)\b[\s\S]{0,40}\blook like\b/.test(text);
  if (!asksForShape) return [];
  // A user uploading data that happens to mention a template still needs the
  // import flow. This matcher only handles requests for the file's shape.
  if (/\b(?:add|create|import|insert|save|upload)\s+(?:(?:these|this|my|the|attached)\s+)?(?:records?|rows?|data|files?|locations?|departments?|shifts?)\b/.test(text)
    && /\b(?:using|with|from|in)\s+(?:(?:a|the|this|my)\s+)?(?:template|format|sheet|file)\b/.test(text)) return [];
  const kinds = [
    /\b(?:location|locations|loc)\b/.test(text) && "location",
    /\b(?:department|departments|dept|departm(?:e|a)nt\w*|depamrtnet)\b/.test(text) && "department",
    /\b(?:shift|shifts)\b/.test(text) && "shift",
  ].filter(Boolean);
  return kinds.length ? kinds : ["location", "department", "shift"];
}

export function templateRequestKind(message) {
  const kinds = templateRequestKinds(message);
  return kinds.length === 1 ? kinds[0] : null;
}

export async function templateWorkbook(kind) {
  const format = formatFor(kind);
  if (!format) return null;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(format.resource[0].toUpperCase() + format.resource.slice(1));
  sheet.addRow(format.columns);
  sheet.addRow(format.example);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 24; });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await book.xlsx.writeBuffer());
}

export function templatePdf(kind) {
  const format = formatFor(kind);
  if (!format) return null;
  const document = new PDFDocument({ size: "A3", layout: "landscape", margin: 36 });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  const width = document.page.width - 72;
  const cellWidth = width / format.columns.length;
  document.font("Helvetica-Bold").fontSize(16).text(`${format.title.replace(/^Correct /, "").replace(/ format$/, "")} bulk upload template`);
  document.font("Helvetica").fontSize(9).text("Replace the example row with your records. Keep the column names as shown.");
  const headerY = document.y + 16;
  const rowHeight = 44;
  document.rect(36, headerY, width, rowHeight).fill("#edf1f7");
  document.rect(36, headerY + rowHeight, width, rowHeight).stroke("#c8d0da");
  format.columns.forEach((column, index) => {
    const x = 36 + index * cellWidth;
    if (index) document.moveTo(x, headerY).lineTo(x, headerY + rowHeight * 2).stroke("#c8d0da");
    document.fillColor("#202b3c").font("Helvetica-Bold").fontSize(format.columns.length > 10 ? 7 : 9)
      .text(column, x + 5, headerY + 6, { width: cellWidth - 10, height: rowHeight - 10 });
  });
  format.example.forEach((value, index) => {
    document.fillColor("#334155").font("Helvetica").fontSize(format.columns.length > 10 ? 7 : 9)
      .text(String(value), 36 + index * cellWidth + 5, headerY + rowHeight + 7, { width: cellWidth - 10, height: rowHeight - 10 });
  });
  document.end();
  return completed;
}

export function importKind(message, fileName = "") {
  const text = String(message || "").toLowerCase();
  const requested = [
    /\b(?:location|locations|loc)\b/.test(text) && "location",
    /\b(?:department|departments|dept|departm(?:e|a)nt\w*)\b/.test(text) && "department",
    /\b(?:shift|shifts|shift management)\b/.test(text) && "shift",
  ].filter(Boolean);
  const asksImport = /\b(?:add|create|import|upload|insert|save)\b/.test(text);
  if (!asksImport) return null;
  if (requested.length === 1) return requested[0];
  const name = String(fileName || "").toLowerCase();
  const filenameKinds = [
    /\b(?:location|locations)\b/.test(name) && "location",
    /\b(?:department|departments|dept)\b/.test(name) && "department",
    /\b(?:shift|shifts)\b/.test(name) && "shift",
  ].filter(Boolean);
  // A single uploaded file can only describe one resource type. When the
  // instruction names several, use an unambiguous filename to select which
  // import to perform.
  if (filenameKinds.length === 1) return filenameKinds[0];
  if (requested.length > 1 || filenameKinds.length > 1) return null;
  return null;
}

async function readRows(file, kind) {
  if (/\.pdf$/i.test(file.originalname || "")) {
    const schema = schemas[kind];
    const tokens = pdfTextTokens(file.buffer);
    try {
      if (tokens.some((token) => token.trim())) return rowsFromPdfTokens(tokens, schema);
    } catch (error) {
      // Fall through to PDF vision extraction for scanned/image-based PDFs or
      // layouts whose text operators do not preserve table reading order.
      if (!/Missing required column|no data rows/i.test(error.message)) throw error;
    }
    return extractConfigurationPdf({ buffer: file.buffer, columns: schema.columns, required: schema.required });
  }
  if (!/\.(xlsx|xls)$/i.test(file.originalname || "")) throw new Error("Upload an Excel (.xlsx) or selectable-text PDF file.");
  const book = new ExcelJS.Workbook();
  // Parse a copy so import processing never mutates the uploaded document
  // buffer that is persisted for the chat attachment.
  await book.xlsx.load(Buffer.from(file.buffer));
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("The workbook has no worksheet.");
  const schema = schemas[kind];
  // Templates may include a title/blank row before the actual column headers.
  // Find the header row by its required field and map only columns present in
  // that row; optional shift settings then retain their normal defaults.
  let headerNumber = 0;
  let index = new Map();
  sheet.eachRow((row, number) => {
    if (headerNumber) return;
    const candidate = values(row);
    const candidateIndex = new Map(candidate.map((header, i) => [canonical(header), i]));
    if (schema.required.every((header) => candidateIndex.has(canonical(header)))) {
      headerNumber = number;
      index = candidateIndex;
    }
  });
  const missing = schema.required.filter((header) => !index.has(canonical(header)));
  if (missing.length) throw new Error(`Missing required column: ${missing.join(", ")}.`);
  const rows = [];
  sheet.eachRow((row, number) => {
    if (number <= headerNumber) return;
    const cells = values(row);
    if (!cells.some((value) => String(value).trim())) return;
    const get = (header) => cells[index.get(canonical(header))] ?? "";
    rows.push({ number, get });
  });
  if (!rows.length) throw new Error("The file has no data rows.");
  return rows;
}

export async function importConfiguration({ file, message, verified }) {
  const kind = importKind(message, file?.originalname);
  if (!kind) return { ok: false, text: "Tell me which type of file to import: locations, departments, or shifts.", ui: { type: "config_import_format_choice" } };
  try {
    const rows = await readRows(file, kind);
    const adminId = verified?.userData?.adminId;
    const orgId = verified?.userData?.orgId;
    if (!adminId) throw new Error("Admin context is missing.");
    const created = [];
    for (const row of rows) {
      if (kind === "location") {
        const locationName = String(row.get("Location Name")).trim();
        if (!locationName) throw new Error(`Row ${row.number}: Location Name is required.`);
        if (await Location.exists({ adminId, locationName: new RegExp(`^${locationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })) continue;
        created.push(await Location.create({ adminId, locationName, empLocationId: String(row.get("Employee Location ID")).trim() || null }));
      } else if (kind === "department") {
        const departmentName = String(row.get("Department Name")).trim();
        if (!departmentName) throw new Error(`Row ${row.number}: Department Name is required.`);
        if (await Department.exists({ adminId, departmentName: new RegExp(`^${departmentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })) continue;
        const id = String(row.get("Employee Department ID")).trim();
        created.push(await Department.create({ adminId, orgId: orgId?.toString(), departmentName, description: String(row.get("Description")).trim(), ...(id ? { empDepartmentId: Number(id) } : {}) }));
      } else {
        const name = String(row.get("Shift Name")).trim();
        if (!name) throw new Error(`Row ${row.number}: Shift Name is required.`);
        if (await Shift.exists({ adminId, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })) continue;
        const workingDays = Object.fromEntries(SHIFT_DAY_KEYS.map((day) => {
          const value = String(row.get(day[0].toUpperCase() + day.slice(1)) || DEFAULT_WORKING_WEEK[day]).trim().toLowerCase();
          if (!["off", "full", "half"].includes(value)) throw new Error(`Row ${row.number}: ${day} must be off, full, or half.`);
          return [day, { type: value }];
        }));
        const isDefault = bool(row.get("Default Shift"), `Row ${row.number}: Default Shift`);
        if (isDefault) await Shift.updateMany({ adminId }, { $set: { isDefault: false } });
        created.push(await Shift.create({ adminId, name, startTime: time(row.get("Start Time"), `Row ${row.number}: Start Time`, "09:00"), endTime: time(row.get("End Time"), `Row ${row.number}: End Time`, "18:00"), breakMinutes: minutes(row.get("Break (min)"), `Row ${row.number}: Break (min)`, 60), graceLateMinutes: minutes(row.get("Grace Late (min)"), `Row ${row.number}: Grace Late (min)`, 0), graceEarlyMinutes: minutes(row.get("Grace Early (min)"), `Row ${row.number}: Grace Early (min)`, 0), maxOvertimeMinutes: minutes(row.get("Max Overtime (min)"), `Row ${row.number}: Max Overtime (min)`, 0), isNightShift: bool(row.get("Night Shift"), `Row ${row.number}: Night Shift`), isDefault, workingDays }));
      }
    }
    return { ok: true, text: `${created.length} ${schemas[kind].label.toLowerCase()} created successfully.${rows.length - created.length ? ` ${rows.length - created.length} duplicate rows were skipped.` : ""}`, ui: { type: "config_import_success", resource: kind, created: created.length } };
  } catch (error) {
    return { ok: false, text: `This format is not correct: ${error.message}`, ui: formatFor(kind) };
  }
}

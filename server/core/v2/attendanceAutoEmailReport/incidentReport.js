import axios from "axios";
import { packingReportData, formatPackingReportDuration } from "./packingReportData.js";
import config from "config";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import moment from "moment-timezone";
import { Incident } from "../incidents/incidents.model.js";
import Admin from "../admin/admin.model.js";
import Channel from "../channels/channels.model.js";

const MAX_ROWS = 10000;
const BLUE = "#3b82f6";
const INK = "#172033";
const MUTED = "#65718a";
const RULE = "#dfe5ef";
const VEHICLE_NUMBER_INCIDENT_TYPES = new Set([
  "vehicleDetection",
  "vehicleObstruction",
  "unauthorizedParkingDetection",
  "loadingUnloadingStockCountingDetection",
  "carModelDetection",
  "vehicleCheckInOut",
]);

const humanize = (value) => String(value || "Detection")
  .replace(/([A-Z])/g, " $1")
  .replace(/^./, (character) => character.toUpperCase())
  .replace(/\s+/g, " ")
  .trim();

const statusOf = (item) => {
  if (item.resolved) return "Resolved";
  if (item.report?.status === true) return "Reported";
  return "New";
};

const imageUrl = (path) => {
  if (!path) return "";
  if (/^(https?:)?\/\//i.test(path) || /^data:/i.test(path)) return path;
  const base = String(config.get("ImageView") || "").replace(/\/+$/, "");
  return `${base}/${String(path).replace(/^\/+/, "")}`;
};

const asText = (value, fallback = "-") => (
  value === null || value === undefined || value === "" ? fallback : String(value)
);

const vehicleNumberRequired = (item) => VEHICLE_NUMBER_INCIDENT_TYPES.has(item?.incidentType);

const showVehicleNumberFor = (details) => (
  typeof details.showVehicleNumber === "boolean"
    ? details.showVehicleNumber
    : details.rows.some(vehicleNumberRequired)
);

const rowFromIncident = (item, timezone) => ({
  id: String(item._id),
  recordedAt: item.timeOfIncident,
  startTime: item.startTime || item.start_time || null,
  endTime: item.endTime || item.end_time || null,
  cameraId: String(item.cameraId?._id || item.cameraId || item.channelData?._id || item.channelId || ''),
  nvrId: String(item.nvrId?._id || item.nvrId || item.nvrData?._id || ''),
  incidentType: item.incidentType,
  incident: asText(item.incidentName || humanize(item.incidentType)),
  detection: humanize(item.incidentType),
  nvr: asText(item.nvrData?.nvrName),
  camera: asText(item.channelData?.customName || item.channelData?.name),
  department: asText((item.departmentData || []).map((department) => department.departmentName || department.name).filter(Boolean).join(", ")),
  location: asText(item.nvrData?.location),
  severity: asText(item.severity),
  status: statusOf(item),
  time: item.timeOfIncident ? moment(item.timeOfIncident).tz(timezone).format("DD/MM/YYYY hh:mm A") : "-",
  confidence: item.ConfidenceScoreInPercentage ?? item.confidence ?? item.accuracy ?? item.score,
  vehicleNumber: asText(item.vehicleNumber),
  description: asText(item.report?.description || item.description),
  image: imageUrl(item.Image),
  boxId: item.boxId || '',
  completedBy: item.completedBy || '',
  zones: Array.isArray(item.zones) ? item.zones : Object.entries(item.zones || {}).map(([zone, data]) => ({ ...data, zone })),
  detectedVia: item.detectedVia || '',
  confirmationReason: item.confirmationReason || '',
});

const isPackingReviewRow = (row) => (
  row.severity === "moderate" || row.severity === "high" || /review|variance|awaiting|new/i.test(`${row.confirmationReason || ""} ${row.status || ""}`)
);


export async function incidentRowsForReport(report, summary) {
  const admin = await Admin.findById(report.adminId).select("user_id").lean();
  if (!admin?.user_id) throw new Error("The report owner does not have an incident data owner configured");

  const incidentTypes = Array.isArray(report.incidentTypes) ? report.incidentTypes : [];
  const imageMatch = { $exists: true, $nin: [null, "", "https://"] };
  const match = {
    userId: String(admin.user_id),
    incidentType: { $in: incidentTypes },
    timeOfIncident: { $gte: summary.start.toDate(), $lte: summary.end.toDate() },
    incidentName: { $not: /Guard Present/i },
    liveDemoData: { $ne: true },
  };
  // A packing confirmation can come from a line sensor and legitimately have
  // no snapshot. Include it in scheduled Incident Reports, while retaining
  // the visual-evidence requirement for every other selected detection.
  if (incidentTypes.includes("boxPackingDetection")) {
    match.$or = [
      { incidentType: "boxPackingDetection" },
      { Image: imageMatch },
    ];
  } else {
    match.Image = imageMatch;
  }

  const incidents = await Incident.aggregate([
    { $match: match },
    { $sort: { timeOfIncident: -1 } },
    { $limit: MAX_ROWS },
    { $lookup: { from: "nvrs", localField: "nvrId", foreignField: "_id", as: "nvrData" } },
    { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "channels", localField: "channelId", foreignField: "_id", as: "channelData" } },
    { $unwind: { path: "$channelData", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "departments", localField: "channelData.department", foreignField: "_id", as: "departmentData" } },
  ]);

  const rows = incidents.map((item) => rowFromIncident(item, summary.timezone));
  // Keep the selected Box Packing report tab with the details. In particular,
  // review schedules must not fall back to the full total-report dataset.
  const reportType = report.reportType || "total";
  const packingOnly = incidentTypes.length === 1 && incidentTypes[0] === "boxPackingDetection";
  const selectedRows = rows.filter((row) => !packingOnly || reportType !== "review" || isPackingReviewRow(row));
  const packingChannels = packingOnly ? await Channel.find({
    userId: String(admin.user_id), isAdded: true,
    "detections.boxPackingDetectionSettings.enabled": true,
  }).select("_id name customName nvrId detections.boxPackingDetectionSettings")
    .populate({ path: "detections.boxPackingDetectionSettings.id", select: "settings" })
    .populate({ path: "nvrId", select: "nvrName name" }).lean() : [];
  const packing = packingOnly ? packingReportData(selectedRows, reportType, summary.timezone, packingChannels) : null;
  return {
    ...summary,
    rows: selectedRows,
    rowCount: packing ? packing.records.length : selectedRows.length,
    ...(packing ? { packingReport: true, packingRecords: packing.records, packingColumns: packing.columns, packingSummary: packing.summary } : {}),
    reportType,
    aggregated: false,
    limited: incidents.length >= MAX_ROWS,
    showVehicleNumber: incidents.some(vehicleNumberRequired),
  };
}

const pdfBuffer = (draw, options = {}) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 28, ...options });
  const chunks = [];
  document.on("data", (chunk) => chunks.push(chunk));
  document.on("end", () => resolve(Buffer.concat(chunks)));
  document.on("error", reject);
  Promise.resolve(draw(document)).then(() => document.end()).catch(reject);
});

const drawReportHeader = (document, details, suffix) => {
  document.font("Helvetica-Bold").fontSize(15).fillColor(INK).text(`Incident Report - ${suffix}`, 28, 22);
  document.font("Helvetica").fontSize(8).fillColor(MUTED)
    .text(`${details.label}  |  ${details.rowCount} incident${details.rowCount === 1 ? "" : "s"}  |  ${details.timezone}`, 28, 42);
};

const isBoxPackingDetails = (details) => details.packingReport || (details.rows.length > 0 && details.rows.every((row) => row.incidentType === "boxPackingDetection" || row.boxId));

const packingRows = (details) => details.rows.map((row) => {
  const record = packingReportData([row], 'total', details.timezone).records[0];
  return {
    id: row.id,
    boxId: asText(row.boxId || row.id),
    operator: record['Completed By'],
    station: JSON.stringify([row.nvrId, row.cameraId || row.channelId]),
    boxes: 1,
    duration: record['Time to complete'],
    date: record.Date,
    start: record['Start time'],
    end: record['End time'],
    cycle: Number((Array.isArray(row.zones) ? row.zones : Object.entries(row.zones || {}).map(([zone, value]) => ({ ...value, zone }))).find(zone => String(zone.zone).trim() === String(row.completedBy).trim())?.timeTakenSec) || 0,
    camera: asText(row.camera || "Packing camera"),
    time: asText(row.time),
    image: row.image,
  };
});

const packingSummary = (rows) => ({
  workers: new Set(rows.filter(row => row.operator && row.operator !== '—').map(row => JSON.stringify([row.station, row.operator]))).size,
  boxes: rows.reduce((sum, row) => sum + row.boxes, 0),
  cycle: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.cycle, 0) / rows.length) : 0,
});

const drawPackingHeader = (document, details, suffix, summary) => {
  const width = document.page.width;
  const split = width * 0.75;
  document.fillColor("#698be8").rect(0, 0, split, 54).fill();
  document.fillColor("#974fe0").rect(split, 0, width - split, 54).fill();
  document.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff").text("VideoiraQ", 28, 19);
  const rightBandX = split + 12;
  const rightBandWidth = width - split - 40;
  document.font("Helvetica-Bold").fontSize(12).fillColor("#ffffff").text("Box Packing Reports", rightBandX, 15, { width: rightBandWidth, align: "right", ellipsis: true });
  document.font("Helvetica").fontSize(7).fillColor("#ffffff").text("Box Packing QC", rightBandX, 34, { width: rightBandWidth, align: "right", ellipsis: true });
  document.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(({ comparison: "Worker Comparison", hourly: "Hourly activity", total: "Total report" })[details.reportType] || "Packing activity", 28, 68);
  document.font("Helvetica").fontSize(8).fillColor(MUTED).text(`${details.label}  |  ${details.timezone}`, 28, 82);
  const cardTop = 96;
  const gap = 10;
  const cardWidth = (width - 56 - gap * 2) / 3;
  [["TOTAL WORKERS", summary.workers ?? 0, "#4f46e5"], ["BOXES PACKED", summary.boxes, "#059669"], ["AVERAGE TIME TO COMPLETE", formatPackingReportDuration(summary.cycle), "#7e22ce"]].forEach(([label, value, color], index) => {
    const x = 28 + index * (cardWidth + gap);
    document.roundedRect(x, cardTop, cardWidth, 34, 5).fillAndStroke("#f8fafc", RULE);
    document.fillColor(color).circle(x + 10, cardTop + 12, 2.2).fill();
    document.font("Helvetica-Bold").fontSize(6.5).fillColor(MUTED).text(label, x + 18, cardTop + 9);
    document.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(String(value), x + 10, cardTop + 20);
  });
  return cardTop + 48;
};

const canonicalPackingData = (details) => details.packingRecords
  ? { records: details.packingRecords, columns: details.packingColumns, summary: details.packingSummary }
  : packingReportData(details.rows, details.reportType, details.timezone);

export function buildBoxPackingListPdf(details) {
  const { records, columns, summary } = canonicalPackingData(details);
  return pdfBuffer((document) => {
    const left = 28, tableWidth = document.page.width - 56;
    const weights = columns.map((column) => ({
      'Camera Name': 1.8,
      Date: 1.2,
      'Start time': 1.1,
      'End time': 1.1,
      'Time to complete': 1.4,
      'Active workers': 2,
      'Time range': 1.6,
    }[column] || 1));
    const widths = weights.map((weight) => tableWidth * weight / weights.reduce((sum, item) => sum + item, 0));
    const drawPage = () => {
      const top = drawPackingHeader(document, details, "List View", summary);
      document.fillColor("#4f46e5").rect(left, top, tableWidth, 28).fill();
      let x = left;
      columns.forEach((column, i) => {
        document.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff").text(column, x + 5, top + 7, { width: widths[i] - 10 });
        x += widths[i];
      });
      return top + 28;
    };
    let y = drawPage();
    records.forEach((record, index) => {
      const text = columns.map((column) => column === "Snapshot" ? (record[column] ? "Open snapshot" : "No snapshot") : String(record[column] ?? "—"));
      document.font("Helvetica").fontSize(7);
      const height = Math.max(32, ...text.map((value, i) => document.heightOfString(value, { width: widths[i] - 10 }) + 14));
      if (y + height > document.page.height - 28) { document.addPage(); y = drawPage(); }
      if (index % 2 === 1) document.fillColor("#f8fafc").rect(left, y, tableWidth, height).fill();
      let x = left;
      columns.forEach((column, i) => {
        const link = column === "Snapshot" ? record[column] : null;
        document.font("Helvetica").fontSize(7).fillColor(link ? "#2563eb" : INK).text(text[i], x + 5, y + 7, { width: widths[i] - 10, height: height - 10, link: link || undefined, underline: Boolean(link) });
        x += widths[i];
      });
      document.strokeColor(RULE).lineWidth(0.4).moveTo(left, y + height).lineTo(left + tableWidth, y + height).stroke();
      y += height;
    });
    if (!records.length) document.font("Helvetica").fontSize(11).fillColor(MUTED).text("No packing records were found for this period.", left, y + 20);
  });
}

export function buildIncidentListPdf(details) {
  if (isBoxPackingDetails(details)) return buildBoxPackingListPdf(details);
  const showVehicleNumber = showVehicleNumberFor(details);
  const columns = [
    ["Sl No", "serialNumber", 25], ["Incident", "incident", showVehicleNumber ? 111 : 141],
    ["NVR", "nvr", showVehicleNumber ? 66 : 76], ["Camera", "camera", showVehicleNumber ? 72 : 82],
    ["Severity", "severity", 48], ["Status", "status", 50], ["Time", "time", 88],
    ...(showVehicleNumber ? [["Vehicle Number", "vehicleNumber", 74]] : []),
    ["Image", "image", 44],
  ];
  return pdfBuffer((document) => {
    const left = 28;
    const tableWidth = columns.reduce((sum, [, , width]) => sum + width, 0);
    const drawTableHeader = (top) => {
      document.fillColor(BLUE).rect(left, top, tableWidth, 24).fill();
      let x = left;
      columns.forEach(([label, , width]) => {
        document.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff").text(label, x + 3, top + 8, { width: width - 6, ellipsis: true });
        x += width;
      });
      return top + 24;
    };
    const drawPage = () => {
      drawReportHeader(document, details, "List View");
      return drawTableHeader(58);
    };

    let y = drawPage();
    details.rows.forEach((row, index) => {
      if (y + 27 > document.page.height - 30) {
        document.addPage();
        y = drawPage();
      }
      if (index % 2 === 1) document.fillColor("#f7f9fc").rect(left, y, tableWidth, 27).fill();
      let x = left;
      columns.forEach(([, key, width]) => {
        const value = key === "serialNumber" ? index + 1 : key === "image" ? (row.image ? "View" : "-") : row[key];
        const linked = key === "image" && row.image;
        document.font("Helvetica").fontSize(6.8).fillColor(linked ? BLUE : INK)
          .text(String(value), x + 3, y + 8, { width: width - 6, height: 14, ellipsis: true, link: linked || undefined, underline: Boolean(linked) });
        x += width;
      });
      document.strokeColor(RULE).lineWidth(0.4).moveTo(left, y + 27).lineTo(left + tableWidth, y + 27).stroke();
      y += 27;
    });
    if (!details.rows.length) document.font("Helvetica").fontSize(11).fillColor(MUTED).text("No incidents were found for this period.", left, y + 20);
  });
}

const fetchImage = async (url) => {
  if (!url) return null;
  try {
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 10000, maxContentLength: 8 * 1024 * 1024 });
    return Buffer.from(response.data);
  } catch {
    return null;
  }
};

const concurrentMap = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, run));
  return results;
};

export async function buildIncidentGridPdf(details) {
  if (isBoxPackingDetails(details)) return buildBoxPackingGridPdf(details);
  return pdfBuffer(async (document) => {
    const margin = 28;
    const gap = 10;
    const columns = 4;
    const cardWidth = (document.page.width - margin * 2 - gap * (columns - 1)) / columns;
    const imageHeight = 75;
    const showVehicleNumber = showVehicleNumberFor(details);
    const cardHeight = showVehicleNumber ? 156 : 146;
    let x = margin;
    let y = 60;
    let column = 0;

    drawReportHeader(document, details, "Grid View");
    const batchSize = 24;
    for (let batchStart = 0; batchStart < details.rows.length; batchStart += batchSize) {
      const batch = details.rows.slice(batchStart, batchStart + batchSize);
      // Keep memory bounded: render each image batch before downloading the
      // next instead of retaining every full-resolution snapshot at once.
      const images = await concurrentMap(batch, 10, (row) => fetchImage(row.image));
      batch.forEach((row, batchIndex) => {
        if (column === 0 && y + cardHeight > document.page.height - 26) {
          document.addPage();
          drawReportHeader(document, details, "Grid View");
          y = 60;
        }
        document.roundedRect(x, y, cardWidth, cardHeight, 5).fillAndStroke("#ffffff", RULE);
        document.roundedRect(x, y, cardWidth, imageHeight, 5).fill("#111827");
        if (images[batchIndex]) {
          try {
            document.image(images[batchIndex], x, y, { fit: [cardWidth, imageHeight], align: "center", valign: "center" });
          } catch {
            // The dark evidence placeholder remains for unsupported/corrupt images.
          }
        }
        if (row.image) document.link(x, y, cardWidth, imageHeight, row.image);

        const detailsToDraw = [
          ["Incident", row.incident], ["NVR", row.nvr], ["Camera", row.camera],
          ["Severity", row.severity], ["Status", row.status], ["Time", row.time],
          ...(showVehicleNumber ? [["Vehicle Number", row.vehicleNumber]] : []),
        ];
        let textY = y + imageHeight + 9;
        detailsToDraw.forEach(([label, value]) => {
          document.font("Helvetica-Bold").fontSize(5.5).fillColor(MUTED).text(label.toUpperCase(), x + 7, textY, { width: 42, ellipsis: true });
          document.font("Helvetica").fontSize(6.5).fillColor(INK).text(asText(value), x + 49, textY, { width: cardWidth - 56, ellipsis: true, align: "right" });
          textY += 10;
        });

        column += 1;
        if (column === columns) {
          column = 0;
          x = margin;
          y += cardHeight + gap;
        } else {
          x += cardWidth + gap;
        }
      });
    }
    if (!details.rows.length) document.font("Helvetica").fontSize(11).fillColor(MUTED).text("No incidents were found for this period.", margin, 80);
  });
}

export async function buildBoxPackingGridPdf(details) {
  if (details.packingReport) return buildBoxPackingListPdf(details);
  const rows = packingRows(details);
  const summary = packingSummary(rows);
  return pdfBuffer(async (document) => {
    const margin = 28;
    const gap = 10;
    const columns = 4;
    const cardWidth = (document.page.width - margin * 2 - gap * (columns - 1)) / columns;
    const imageHeight = 76;
    const cardHeight = 155;
    let x = margin;
    let y = drawPackingHeader(document, details, "Grid View", summary);
    let column = 0;
    const batchSize = 24;
    for (let batchStart = 0; batchStart < rows.length; batchStart += batchSize) {
      const batch = rows.slice(batchStart, batchStart + batchSize);
      const images = await concurrentMap(batch, 10, (row) => fetchImage(row.image));
      batch.forEach((row, batchIndex) => {
        if (column === 0 && y + cardHeight > document.page.height - 26) {
          document.addPage();
          y = drawPackingHeader(document, details, "Grid View", summary);
        }
        document.roundedRect(x, y, cardWidth, cardHeight, 5).fillAndStroke("#ffffff", RULE);
        document.roundedRect(x, y, cardWidth, imageHeight, 5).fill("#111827");
        if (images[batchIndex]) { try { document.image(images[batchIndex], x, y, { fit: [cardWidth, imageHeight], align: "center", valign: "center" }); } catch { /* keep placeholder */ } }
        if (row.image) document.link(x, y, cardWidth, imageHeight, row.image);
        const detailsToDraw = [["Box ID", row.boxId], ["WORKER", row.operator], ["DATE", row.date], ["START TIME", row.start], ["END TIME", row.end], ["TIME TO COMPLETE", row.duration], ["CAMERA", row.camera]];
        let textY = y + imageHeight + 9;
        detailsToDraw.forEach(([label, value]) => {
          document.font("Helvetica-Bold").fontSize(5.5).fillColor(MUTED).text(label, x + 7, textY, { width: 42, ellipsis: true });
          document.font("Helvetica").fontSize(6.5).fillColor(INK).text(asText(value), x + 49, textY, { width: cardWidth - 56, ellipsis: true, align: "right" });
          textY += 9;
        });
        column += 1;
        if (column === columns) { column = 0; x = margin; y += cardHeight + gap; } else x += cardWidth + gap;
      });
    }
    if (!rows.length) document.font("Helvetica").fontSize(11).fillColor(MUTED).text("No packing records were found for this period.", margin, y + 20);
  });
}

export async function buildIncidentWorkbook(details) {
  if (isBoxPackingDetails(details)) return buildBoxPackingWorkbook(details);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Incidents");
  const showVehicleNumber = showVehicleNumberFor(details);
  sheet.columns = [
    { header: "Sl No", key: "number", width: 8 },
    { header: "Incident", key: "incident", width: 34 },
    { header: "Detection", key: "detection", width: 30 },
    { header: "NVR", key: "nvr", width: 24 },
    { header: "Camera", key: "camera", width: 26 },
    { header: "Severity", key: "severity", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Time of Incident", key: "time", width: 24 },
    ...(showVehicleNumber ? [{ header: "Vehicle Number", key: "vehicleNumber", width: 20 }] : []),
    { header: "Image", key: "image", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B82F6" } };
  details.rows.forEach((row, index) => {
    const excelRow = sheet.addRow({ ...row, number: index + 1, image: row.image ? "View image" : "-" });
    if (row.image) {
      const cell = excelRow.getCell("image");
      cell.value = { text: "View image", hyperlink: row.image };
      cell.font = { color: { argb: "FF2563EB" }, underline: true };
    }
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(sheet.columnCount).letter}1` };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildBoxPackingWorkbook(details) {
  const { records, columns } = canonicalPackingData(details);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Packing Report");
  sheet.columns = columns.map((column) => ({ header: column, key: column, width: /Camera|Date|Time range|Active workers/i.test(column) ? 32 : 20 }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  sheet.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  records.forEach((record, index) => {
    const row = sheet.addRow({ ...record, ...(columns.includes("Snapshot") ? { Snapshot: record.Snapshot ? "Open snapshot" : "No snapshot" } : {}) });
    row.alignment = { wrapText: true, vertical: "middle" };
    if (index % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    if (record.Snapshot) {
      row.getCell("Snapshot").value = { text: "Open snapshot", hyperlink: record.Snapshot };
      row.getCell("Snapshot").font = { color: { argb: "FF2563EB" }, underline: true };
    }
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(sheet.columnCount).letter}1` };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

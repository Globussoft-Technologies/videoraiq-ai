import axios from "axios";
import config from "config";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import moment from "moment-timezone";
import { Incident } from "../incidents/incidents.model.js";
import Admin from "../admin/admin.model.js";

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
});

export async function incidentRowsForReport(report, summary) {
  const admin = await Admin.findById(report.adminId).select("user_id").lean();
  if (!admin?.user_id) throw new Error("The report owner does not have an incident data owner configured");

  const match = {
    userId: String(admin.user_id),
    incidentType: { $in: report.incidentTypes || [] },
    timeOfIncident: { $gte: summary.start.toDate(), $lte: summary.end.toDate() },
    Image: { $exists: true, $nin: [null, "", "https://"] },
    incidentName: { $not: /Guard Present/i },
    liveDemoData: { $ne: true },
  };

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
  return {
    ...summary,
    rows,
    rowCount: rows.length,
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

export function buildIncidentListPdf(details) {
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

export async function buildIncidentWorkbook(details) {
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

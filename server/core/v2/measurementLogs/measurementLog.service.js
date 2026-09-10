import config from "config";
import moment from "moment-timezone";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import MeasurementIncident from "./measurementLog.model.js";

const CM_PER_INCH = 2.54;
const MM_PER_INCH = 25.4;

// Resolve a stored media path (qr / measurement image) to an absolute URL so the
// table thumbnail, the preview modal and the PDF/XLSX/CSV exports all link the
// same place. Values that are already absolute pass through untouched.
//
// The measurement pipeline stores capture paths relative to the API host, e.g.
// "/api/v2/measurements/captures/<file>.jpg" — those just need the host prefixed.
// Older upload-folder paths (no leading "/api/") are joined onto ImageView.
function backendDomain() {
  try {
    if (config.has("backendDomain")) return String(config.get("backendDomain") || "").replace(/\/+$/, "");
  } catch { /* not configured */ }
  return "";
}

function mediaUrl(pathValue) {
  let p = String(pathValue || "").trim();
  if (!p) return "";

  // A previously-persisted absolute URL: keep just its path so we re-prefix the
  // current host, and undo the old "/api/v2/uploads/api/v2/..." double-prefix bug.
  if (/^https?:\/\//i.test(p)) {
    try { p = new URL(p).pathname; } catch { return p; }
  }
  p = p.replace(/^\/?api\/v2\/uploads(?=\/api\/)/i, "");

  const host = backendDomain();
  if (/^\/?api\//i.test(p)) {
    return `${host}/${p.replace(/^\/+/, "")}`;
  }

  let base = host;
  try {
    if (config.has("ImageView")) base = String(config.get("ImageView") || "");
  } catch { /* not configured */ }
  return `${base.replace(/\/+$/, "")}/${p.replace(/^\/+/, "")}`;
}

// Per-axis tolerance in inches — matches the "Deviation by Axis" card on the page.
const TOLERANCE = { length: 0.5, breadth: 0.5, height: 0.25 };

const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

// DS `measuredData` is not consistent between stations:
//  - the breadth axis arrives as either `breadth` or `width`;
//  - the numeric unit has been seen as inches, centimetres and millimetres.
// The QR label (`qrMetadata`) is always inches and is the anchor we trust.
// We pick ONE scale for the whole record — the one that best matches the label
// across all three axes together — and apply it uniformly, so a record is
// never a mix of units. When even the best scale is far from the label the
// scan is simply bad; we still convert (cm, the documented default) so the
// deviation column shows how wrong it is rather than hiding it.
const SCALES = [
  { div: 1, unit: "in" },
  { div: CM_PER_INCH, unit: "cm" },
  { div: MM_PER_INCH, unit: "mm" },
];

function measuredTriple(md = {}, printed = {}) {
  const raw = {
    L: Number.isFinite(md.length) ? md.length : null,
    W: Number.isFinite(md.breadth) ? md.breadth : (Number.isFinite(md.width) ? md.width : null),
    H: Number.isFinite(md.height) ? md.height : null,
  };
  if (raw.L == null && raw.W == null && raw.H == null) {
    return { L: null, W: null, H: null, unit: null };
  }

  const axes = ["L", "W", "H"];
  const haveLabel = axes.some((k) => Number.isFinite(printed[k]) && printed[k] > 0);

  let best = SCALES[1]; // default: centimetres
  if (haveLabel) {
    let bestErr = Infinity;
    for (const s of SCALES) {
      let err = 0;
      let n = 0;
      for (const k of axes) {
        if (raw[k] == null || !Number.isFinite(printed[k]) || printed[k] <= 0) continue;
        err += Math.abs(raw[k] / s.div - printed[k]) / printed[k];
        n += 1;
      }
      if (n && err / n < bestErr) {
        bestErr = err / n;
        best = s;
      }
    }
  }

  return {
    L: raw.L == null ? null : raw.L / best.div,
    W: raw.W == null ? null : raw.W / best.div,
    H: raw.H == null ? null : raw.H / best.div,
    unit: best.unit,
  };
}

// stationId is a device MAC (88:a2:9e:d0:95:ec). Render a short, stable label
// from its last octet so the table column stays readable; the raw MAC is kept
// on the row (`stationId`) for anyone who needs it.
function stationLabel(id) {
  if (!id) return "—";
  const m = String(id).match(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i);
  if (!m) return id;
  return `QC-${String(id).split(":").pop().toUpperCase()}`;
}
const signed = (n) => {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.05) return "±0.0";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
};

function adminIdFrom(req) {
  const a = req?.verified?.userData?.adminId;
  return a ? String(a) : null;
}

/**
 * Turn one measurement_incidents doc into the flat row the Measurement Logs
 * table renders. Measured dimensions are stored in centimetres; the label
 * dimensions (qrMetadata) are inches — convert measured to inches so the two
 * are comparable.
 */
function toRow(doc, timezone) {
  const meta = doc.qrMetadata || {};
  const md = doc.measuredData || {};

  const printed = { L: meta.length, W: meta.breadth, H: meta.height };
  const measured = measuredTriple(md, printed);

  const dev = {
    L: measured.L != null && printed.L != null ? measured.L - printed.L : null,
    W: measured.W != null && printed.W != null ? measured.W - printed.W : null,
    H: measured.H != null && printed.H != null ? measured.H - printed.H : null,
  };

  // Worst axis as a fraction of its tolerance — drives the "MATCH" bar and %.
  const ratios = [
    dev.L != null ? Math.abs(dev.L) / TOLERANCE.length : null,
    dev.W != null ? Math.abs(dev.W) / TOLERANCE.breadth : null,
    dev.H != null ? Math.abs(dev.H) / TOLERANCE.height : null,
  ].filter((r) => r != null);
  const devFrac = ratios.length ? Math.max(...ratios) : 0;

  // status: rejected -> Mismatch. pending -> QR Error (unreviewed / unread).
  // accepted -> Pass, unless the deviation already blows tolerance.
  let status;
  if (doc.status === "rejected") status = "mismatch";
  else if (doc.status === "pending") status = "qrerr";
  else status = devFrac > 1 ? "mismatch" : "pass";

  const hasMeasure = measured.L != null || measured.W != null || measured.H != null;
  const fmtTriple = (a, b, c) =>
    [a, b, c].every((v) => v == null)
      ? "— × — × —"
      : `${round1(a) ?? "—"} × ${round1(b) ?? "—"} × ${round1(c) ?? "—"}`;

  const when = doc.dsProcessedAt || doc.createdAt || doc.updatedAt;
  const id = String(doc._id);
  const confidence = Number.isFinite(md.confidence) ? md.confidence : null;

  // The capture is implausible when, even after unit-matching, an axis is off
  // by more than half the labelled size (a 72" side reading 30" or 130").
  // Combined with low confidence this means "the DS did not measure this unit".
  const offBy = (m, p) =>
    m != null && Number.isFinite(p) && p > 0 ? Math.abs(m - p) / p : 0;
  const implausible =
    hasMeasure &&
    Math.max(
      offBy(measured.L, printed.L),
      offBy(measured.W, printed.W),
      offBy(measured.H, printed.H),
    ) > 0.5;

  return {
    id,
    orderId: meta.sales_order || meta.order_item || "—",
    orderItem: meta.order_item || "—",
    refNo: meta.ref_no || "—",
    sku: doc.qrSku || meta.sku || "—",
    model: meta.size_type && meta.size_type !== "NA" ? meta.size_type : "Mattress",
    colour: "—",
    declared:
      printed.L != null ? `${printed.L} × ${printed.W} × ${printed.H}` : "— × — × —",
    measured: hasMeasure ? fmtTriple(measured.L, measured.W, measured.H) : "— × — × —",
    // Raw DS values + the unit we detected — so the table can show exactly what
    // the pipeline stored, and reviewers can spot a bad scan / unit.
    measuredRaw:
      [md.length, md.breadth ?? md.width, md.height].every((v) => v == null)
        ? "— × — × —"
        : `${round1(md.length) ?? "—"} × ${round1(md.breadth ?? md.width) ?? "—"} × ${round1(md.height) ?? "—"}`,
    measuredUnit: measured.unit,
    implausible,
    devL: signed(dev.L),
    devB: signed(dev.W),
    devH: signed(dev.H),
    // Share of the per-axis tolerance the worst axis uses, capped at 100%
    // (at or beyond tolerance it's a mismatch either way; the raw ratio is noisy).
    devPct:
      doc.status === "pending"
        ? "QR unread"
        : `${Math.min(100, Math.round(devFrac * 100))}% of tol.`,
    devFrac,
    station: stationLabel(doc.stationId),
    stationId: doc.stationId || null,
    time: when ? moment(when).tz(timezone).format("HH:mm:ss") : "—",
    date: when ? moment(when).tz(timezone).format("DD MMM YYYY") : "—",
    dateTime: when ? moment(when).tz(timezone).format("DD MMM YYYY, HH:mm:ss") : "—",
    status,
    confidence,
    // DS confidence below this reads as "don't trust the numbers without the
    // photo" — surfaced on the row so a reviewer knows which scans to check.
    lowConfidence: confidence != null && confidence < 0.6,
    // `shot` = whichever frame we have; `shotUrl` / `measurementImageUrl` are the
    // absolute links used by the preview modal and the exports.
    shot: mediaUrl(doc.qrImage?.url || doc.qrImagePath || doc.measurementImage || ""),
    shotUrl: mediaUrl(doc.qrImage?.url || doc.qrImagePath || doc.measurementImage || ""),
    qrImageUrl: mediaUrl(doc.qrImage?.url || doc.qrImagePath || ""),
    measurementImage: doc.measurementImage || "",
    measurementImageUrl: mediaUrl(doc.measurementImage || ""),
    createdAt: doc.createdAt,
  };
}

/**
 * Numeric per-axis deviation (measured − printed, inches) for one incident,
 * plus the derived Pass / Mismatch / QR-error status. Shares the exact
 * conversion + tolerance logic `toRow` uses so the analytics cards and the
 * records table never disagree.
 */
function deviationOf(doc) {
  const meta = doc.qrMetadata || {};
  const md = doc.measuredData || {};
  const printed = { L: meta.length, W: meta.breadth, H: meta.height };
  const measured = measuredTriple(md, printed);
  const dev = {
    L: measured.L != null && printed.L != null ? measured.L - printed.L : null,
    W: measured.W != null && printed.W != null ? measured.W - printed.W : null,
    H: measured.H != null && printed.H != null ? measured.H - printed.H : null,
  };
  const ratios = [
    dev.L != null ? Math.abs(dev.L) / TOLERANCE.length : null,
    dev.W != null ? Math.abs(dev.W) / TOLERANCE.breadth : null,
    dev.H != null ? Math.abs(dev.H) / TOLERANCE.height : null,
  ].filter((r) => r != null);
  const devFrac = ratios.length ? Math.max(...ratios) : 0;

  let status;
  if (doc.status === "rejected") status = "mismatch";
  else if (doc.status === "pending") status = "qrerr";
  else status = devFrac > 1 ? "mismatch" : "pass";

  return { dev, devFrac, status };
}

// Build the Mongo match for a measurement-logs query from the request.
function buildMatch(req, adminId) {
  const match = { adminId };
  if (req.query.station && req.query.station !== "all") {
    const s = req.query.station;
    match.stationId = /^QC-[0-9A-F]{2}$/i.test(s)
      ? { $regex: `${s.slice(3)}$`, $options: "i" }
      : s;
  }
  if (req.query.sku && req.query.sku !== "all") match.qrSku = req.query.sku;
  if (["accepted", "pending", "rejected"].includes(req.query.dbStatus)) {
    match.status = req.query.dbStatus;
  }
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    match.$or = [
      { qrSku: rx },
      { "qrMetadata.ref_no": rx },
      { "qrMetadata.sales_order": rx },
      { "qrMetadata.order_item": rx },
    ];
  }
  // Optional ISO date window (analytics uses this; list keeps its HH:mm filter).
  const from = req.query.fromDate ? new Date(req.query.fromDate) : null;
  const to = req.query.toDate ? new Date(req.query.toDate) : null;
  if ((from && !Number.isNaN(+from)) || (to && !Number.isNaN(+to))) {
    const range = {};
    if (from && !Number.isNaN(+from)) range.$gte = from;
    if (to && !Number.isNaN(+to)) range.$lte = to;
    match.$and = [{ $or: [{ dsProcessedAt: range }, { createdAt: range }] }];
  }
  return match;
}

const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

/**
 * Throughput & Failures bars — only buckets that actually have measurements,
 * in chronological order. `unit` decides the bucket size and label:
 *   hour  → 08:00, 09:00 …            (single-day range)
 *   day   → 01 Sep, 02 Sep …          (multi-day / month range)
 *   month → Jan 2026, Feb 2026 …      (year+ range)
 */
function buildThroughput(unit, buckets) {
  const labelFor = (key) => {
    if (unit === "hour") return `${key}:00`;
    if (unit === "day") return moment(key, "YYYY-MM-DD").format("DD MMM");
    return moment(key, "YYYY-MM").format("MMM YYYY");
  };
  const sortVal = (key) => (unit === "hour" ? Number(key) : key);

  return [...buckets.entries()]
    .filter(([, b]) => b.ok + b.fail > 0)
    .sort((a, b) => (sortVal(a[0]) < sortVal(b[0]) ? -1 : 1))
    .map(([key, b]) => ({ key, label: labelFor(key), pass: b.ok, fail: b.fail }));
}

/**
 * Per-SKU mismatch rows for the "Mismatch Rate by SKU" card / modal.
 * `docs` are already window-scoped; pass a lowercase `q` to keep only SKUs
 * (or models) whose text contains it.
 */
function skuMismatchRows(docs, q = "") {
  const term = String(q || "").trim().toLowerCase();
  const skuMap = new Map();

  for (const doc of docs) {
    const { status } = deviationOf(doc);
    const meta = doc.qrMetadata || {};
    const md = doc.measuredData || {};
    const sku = doc.qrSku || meta.sku || "—";
    if (!sku || sku === "—") continue;

    const model = meta.size_type && meta.size_type !== "NA" ? meta.size_type : "Mattress";
    if (term && !`${sku} ${model}`.toLowerCase().includes(term)) continue;

    const declared =
      meta.length != null
        ? `${round1(meta.length)}×${round1(meta.breadth)}×${round1(meta.height)}`
        : "";
    const s =
      skuMap.get(sku) ||
      { sku, model, declared, count: 0, fails: 0, mL: 0, mW: 0, mH: 0, mN: 0 };
    s.count += 1;
    if (status === "mismatch") s.fails += 1;
    if (!s.declared && declared) s.declared = declared;

    const mIn = measuredTriple(md, { L: meta.length, W: meta.breadth, H: meta.height });
    if (mIn.L != null && mIn.W != null && mIn.H != null) {
      s.mL += mIn.L;
      s.mW += mIn.W;
      s.mH += mIn.H;
      s.mN += 1;
    }
    skuMap.set(sku, s);
  }

  return [...skuMap.values()]
    .map((s) => ({
      sku: s.sku,
      name: s.sku,
      model: s.model,
      declared: s.declared || "—",
      measured: s.mN
        ? `${round1(s.mL / s.mN)}×${round1(s.mW / s.mN)}×${round1(s.mH / s.mN)}`
        : "—",
      fails: s.fails,
      count: s.count,
      rate: s.count ? Math.round((s.fails / s.count) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.count - a.count);
}

class MeasurementLogService {
  /**
   * GET /api/v2/measurement-logs
   * Query: status (all|pass|mismatch|qrerr), sku, station, q (order / ref / sku),
   *        fromDate / toDate (ISO — the global date-range filter),
   *        from / to (HH:mm — legacy time-of-day filter), skip, limit.
   */
  async list(req, res) {
    try {
      const adminId = adminIdFrom(req);
      if (!adminId) return res.status(401).json(Response.userFailResp("Authentication context is missing"));

      const timezone = req.query.timezone || "Asia/Kolkata";
      const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);
      const limit = Math.min(Math.max(parseInt(req.query.limit || "200", 10), 1), 1000);

      // Shares the station / sku / dbStatus / q / fromDate / toDate logic with
      // the analytics endpoint so both views scope to the same window.
      const match = buildMatch(req, adminId);

      const docs = await MeasurementIncident.find(match)
        .sort({ dsProcessedAt: -1, createdAt: -1 })
        .limit(limit + skip + 500) // headroom for the post-map status filter
        .lean();

      let rows = docs.map((d) => toRow(d, timezone));

      const statusF = req.query.status;
      if (statusF && statusF !== "all") rows = rows.filter((r) => r.status === statusF);

      const from = req.query.from;
      const to = req.query.to;
      if (from) rows = rows.filter((r) => r.time !== "—" && r.time >= from);
      if (to) rows = rows.filter((r) => r.time !== "—" && r.time <= to);

      const total = rows.length;
      const paged = rows.slice(skip, skip + limit);

      // Aggregates for the KPI cards + analytics.
      const all = docs.map((d) => toRow(d, timezone));
      const passCount = all.filter((r) => r.status === "pass").length;
      const stats = {
        total: all.length,
        pass: passCount,
        mismatch: all.filter((r) => r.status === "mismatch").length,
        qrErr: all.filter((r) => r.status === "qrerr").length,
        passRate: all.length ? `${((passCount / all.length) * 100).toFixed(1)}%` : "0%",
      };

      return res.json(
        Response.userSuccessResp("Measurement records fetched", {
          rows: paged,
          total,
          skip,
          limit,
          stats,
          skus: [...new Set(all.map((r) => r.sku).filter((s) => s && s !== "—"))].sort(),
          stations: [...new Set(all.map((r) => r.station).filter((s) => s && s !== "—"))].sort(),
        }),
      );
    } catch (error) {
      logger.error(`[MEASUREMENT_LOGS] list failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to fetch measurement records", error.message));
    }
  }

  /**
   * GET /api/v2/measurement-logs/analytics
   * Feeds the KPI row + the three analytics cards (Deviation by Axis,
   * Throughput & Failures, Mismatch Rate by SKU).
   * Query: station, sku, q, dbStatus (same as list) plus optional
   *        fromDate / toDate (ISO). Defaults to the last 24h ("shift").
   */
  async analytics(req, res) {
    try {
      const adminId = adminIdFrom(req);
      if (!adminId) return res.status(401).json(Response.userFailResp("Authentication context is missing"));

      const timezone = req.query.timezone || "Asia/Kolkata";

      // Default window: last 24h, unless the caller passed an explicit range.
      if (!req.query.fromDate && !req.query.toDate) {
        req.query.fromDate = moment().tz(timezone).subtract(24, "hours").toISOString();
      }
      const match = buildMatch(req, adminId);

      const docs = await MeasurementIncident.find(match)
        .sort({ dsProcessedAt: -1, createdAt: -1 })
        .limit(20000)
        .lean();

      const total = docs.length;
      let pass = 0;
      let mismatch = 0;
      let qrErr = 0;

      // Per-axis absolute-deviation accumulators.
      const AX = {
        Length: { key: "L", tol: TOLERANCE.length, sum: 0, n: 0, max: 0, out: 0 },
        Width: { key: "W", tol: TOLERANCE.breadth, sum: 0, n: 0, max: 0, out: 0 },
        Height: { key: "H", tol: TOLERANCE.height, sum: 0, n: 0, max: 0, out: 0 },
      };

      // Throughput bucket granularity is chosen from the selected range:
      //   ≤ 1 day   → by hour   (00:00 … 23:00)
      //   ≤ 92 days → by day    (Sep 01 … Sep 30)
      //   otherwise → by month  (Jan … Dec)
      const winFrom = req.query.fromDate ? moment(req.query.fromDate).tz(timezone) : null;
      const winTo = req.query.toDate ? moment(req.query.toDate).tz(timezone) : moment().tz(timezone);
      const spanDays = winFrom ? Math.max(0, winTo.diff(winFrom, "days")) : 0;
      const bucketUnit = !winFrom || spanDays <= 1 ? "hour" : spanDays <= 92 ? "day" : "month";

      const buckets = new Map(); // bucketKey -> { ok, fail }
      const bucketKey = (m) => {
        if (bucketUnit === "hour") return m.format("HH");
        if (bucketUnit === "day") return m.format("YYYY-MM-DD");
        return m.format("YYYY-MM");
      };

      const confidences = [];

      for (const doc of docs) {
        const { dev, status } = deviationOf(doc);
        if (status === "pass") pass += 1;
        else if (status === "mismatch") mismatch += 1;
        else qrErr += 1;

        for (const ax of Object.values(AX)) {
          const d = dev[ax.key];
          if (d == null) continue;
          const abs = Math.abs(d);
          ax.sum += abs;
          ax.n += 1;
          if (abs > ax.max) ax.max = abs;
          if (abs > ax.tol) ax.out += 1;
        }

        const when = doc.dsProcessedAt || doc.createdAt || doc.updatedAt;
        if (when) {
          const k = bucketKey(moment(when).tz(timezone));
          const bucket = buckets.get(k) || { ok: 0, fail: 0 };
          if (status === "mismatch") bucket.fail += 1;
          else bucket.ok += 1;
          buckets.set(k, bucket);
        }

        const c = doc.measuredData?.confidence;
        if (Number.isFinite(c)) confidences.push(c);
      }

      const avgDeviation = (() => {
        const totals = Object.values(AX).reduce(
          (acc, ax) => ({ sum: acc.sum + ax.sum, n: acc.n + ax.n }),
          { sum: 0, n: 0 },
        );
        return totals.n ? round2(totals.sum / totals.n) : 0;
      })();

      const kpis = {
        measured: total,
        passRate: total ? Number(((pass / total) * 100).toFixed(1)) : 0,
        sizeMismatch: mismatch,
        qrReadErrors: qrErr,
        avgDeviationIn: avgDeviation,
        avgConfidence: confidences.length
          ? round2(confidences.reduce((a, b) => a + b, 0) / confidences.length)
          : null,
      };

      const deviationByAxis = Object.entries(AX).map(([axis, ax]) => {
        const avg = ax.n ? ax.sum / ax.n : 0;
        return {
          axis,
          tolIn: ax.tol,
          avgIn: round2(avg),
          maxIn: round2(ax.max),
          measured: ax.n,
          outOfTol: ax.out,
          // % of the tolerance the mean deviation uses — drives the bar width.
          pct: Math.min(100, Math.round((avg / ax.tol) * 100)),
        };
      });

      const throughput = buildThroughput(bucketUnit, buckets);

      // Full list — the client shows the top rows inline and searches the rest
      // via GET /measurement-logs/mismatch-by-sku?q=…
      const mismatchBySku = skuMismatchRows(docs);

      return res.json(
        Response.userSuccessResp("Measurement analytics fetched", {
          window: {
            from: req.query.fromDate || null,
            to: req.query.toDate || null,
            timezone,
          },
          kpis,
          deviationByAxis,
          throughput,
          throughputUnit: bucketUnit, // "hour" | "day" | "month"
          mismatchBySku,
        }),
      );
    } catch (error) {
      logger.error(`[MEASUREMENT_LOGS] analytics failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to fetch measurement analytics", error.message));
    }
  }

  /**
   * GET /api/v2/measurement-logs/mismatch-by-sku
   * Server-side search for the "Mismatch Rate by SKU" modal.
   * Query: q (SKU / model text), station, dbStatus, fromDate / toDate (ISO),
   *        limit (default 200). Defaults to the last 24h like /analytics.
   */
  async mismatchBySku(req, res) {
    try {
      const adminId = adminIdFrom(req);
      if (!adminId) return res.status(401).json(Response.userFailResp("Authentication context is missing"));

      const timezone = req.query.timezone || "Asia/Kolkata";
      const q = String(req.query.q || "").trim();
      const limit = Math.min(Math.max(parseInt(req.query.limit || "200", 10), 1), 1000);

      if (!req.query.fromDate && !req.query.toDate) {
        req.query.fromDate = moment().tz(timezone).subtract(24, "hours").toISOString();
      }
      // `q` filters SKUs after aggregation, not the doc scan — drop it from the match.
      const { q: _drop, ...rest } = req.query;
      const match = buildMatch({ ...req, query: rest }, adminId);

      const docs = await MeasurementIncident.find(match)
        .sort({ dsProcessedAt: -1, createdAt: -1 })
        .limit(20000)
        .lean();

      const all = skuMismatchRows(docs, q);

      return res.json(
        Response.userSuccessResp("Mismatch by SKU fetched", {
          window: {
            from: req.query.fromDate || null,
            to: req.query.toDate || null,
            timezone,
          },
          q,
          total: all.length,
          rows: all.slice(0, limit),
        }),
      );
    } catch (error) {
      logger.error(`[MEASUREMENT_LOGS] mismatchBySku failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to fetch mismatch by SKU", error.message));
    }
  }
}

export default new MeasurementLogService();
export { toRow, deviationOf, buildMatch };

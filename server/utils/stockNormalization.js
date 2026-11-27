import {
  normalizeStockSettingMode,
  STEEL_STACK_STOCK_SETTING_MODE,
  STOCK_SETTING_MODES,
} from "../constants/detectionTypes.js";

export const STOCK_INCIDENT_TYPE = "loadingUnloadingStockCountingDetection";

export function stockIncidentModeFilter(mode) {
  if (mode === undefined || mode === "") return {};

  const normalized = normalizeStockSettingMode(mode);
  if (!STOCK_SETTING_MODES.includes(normalized)) return null;

  return {
    incidentType: STOCK_INCIDENT_TYPE,
    // Compare stored values directly so Mongoose's setter cannot rewrite
    // the legacy spelling in countDocuments filters.
    ...(normalized === STEEL_STACK_STOCK_SETTING_MODE
      ? { $expr: { $in: ["$incidentMode", [normalized, "steelStackSettings"]] } }
      : { incidentMode: normalized }),
  };
}

// Shared interpretation for analytics, raw evidence and grouped stock logs.
// Invalid counts remain events but contribute no box throughput.
export const stockNormalizationStages = (timezone) => [
        {
          $set: {
            _direction: {
              $toLower: { $trim: { input: { $ifNull: ["$direction", { $ifNull: ["$stockMovement", "unknown"] }] } } },
            },
            _boxCount: {
              $convert: {
                input: { $ifNull: ["$boxCount", "$count"] },
                to: "double", onError: null, onNull: null,
              },
            },
            _boxType: {
              $let: {
                vars: { value: { $toLower: { $trim: { input: { $ifNull: ["$boxType", ""] } } } } },
                in: { $cond: [{ $eq: ["$$value", ""] }, "unknown", "$$value"] },
              },
            },
            _vehicle: {
              $let: {
                vars: { value: { $toUpper: { $trim: { input: { $ifNull: ["$vehicleNumber", ""] } } } } },
                in: { $cond: [{ $eq: ["$$value", ""] }, "UNKNOWN", "$$value"] },
              },
            },
            _date: {
              $dateToString: { date: "$timeOfIncident", format: "%Y-%m-%d", timezone },
            },
            _hour: {
              $hour: { date: "$timeOfIncident", timezone },
            },
          },
        },
        { $set: {
          _invalidCount: { $or: [{ $eq: ["$_boxCount", null] }, { $lt: ["$_boxCount", 0] }, { $ne: ["$_boxCount", { $trunc: "$_boxCount" }] }] },
          // Bare UNKNOWN means no plate. UNKNOWN1, UNKNOWN2... are DS ids for one unreadable truck, so they group like real plates.
          _vehicle: { $cond: [{ $regexMatch: { input: "$_vehicle", regex: "^(UNKNOWN|UNREADABLE.*|N/?A|NONE|NULL|-)$" } }, "UNKNOWN", "$_vehicle"] },
        } },
        { $set: { _boxCount: { $cond: ["$_invalidCount", 0, "$_boxCount"] } } },
        { $set: { _validColourSplit: { $and: [
          ...["brownCount", "whiteCount", "otherCount"].map((field) => ({ $and: [
            { $isNumber: `$${field}` },
            { $gte: [`$${field}`, 0] },
            { $eq: [`$${field}`, { $trunc: { $convert: { input: `$${field}`, to: "double", onError: null, onNull: null } } }] },
          ] })),
          { $eq: [{ $add: ["brownCount", "whiteCount", "otherCount"].map((field) => ({ $convert: { input: `$${field}`, to: "double", onError: null, onNull: null } })) }, "$_boxCount"] },
          { $eq: ["$_invalidCount", false] },
        ] } } },
];

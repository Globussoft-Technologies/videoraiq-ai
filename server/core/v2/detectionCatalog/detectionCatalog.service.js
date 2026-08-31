import DetectionCatalog from "./detectionCatalog.model.js";
import {
  DETECTION_TYPES,
  DETECTION_MODES_MAP,
  dsDetectorsForModes,
} from "../../../constants/detectionTypes.js";
import logger from "../../../utils/logger.js";
import pythonService from "../../../services/python.service.js";

/**
 * Publish this backend's DETECTION_TYPES into the shared catalog collection.
 *
 * This backend owns the master list — a detection only works once it is
 * implemented here — so it is the publisher, and server-superadmin reads the
 * collection rather than maintaining its own copy of the constants.
 *
 * Runs on boot, which is when the constants can actually have changed (they
 * only move with a deploy). Idempotent: re-running with an unchanged list is a
 * no-op beyond bumping syncedAt.
 *
 * Nothing is ever deleted. A type dropped from the constants is flagged
 * inactive so ClientDetectionAllocation rows, which key on settingType, still
 * resolve to a display name instead of becoming orphans.
 */
export const syncDetectionCatalog = async () => {
  const entries = Object.entries(DETECTION_TYPES);
  if (entries.length === 0) {
    logger.warn("[DETECTION_CATALOG] DETECTION_TYPES is empty — skipping sync");
    return { added: 0, updated: 0, deactivated: 0, total: 0 };
  }

  const now = new Date();
  const settingTypes = entries.map(([settingType]) => settingType);

  // Ask DS which detectors it implements, so the superadmin can see that e.g.
  // Door Detection is configurable here but has no engine behind it. null when
  // DS cannot be reached — distinct from "DS said no".
  let dsNames = null;
  try {
    const fetched = await pythonService.fetchDsDetectorNames();
    if (fetched?.names?.length) dsNames = new Set(fetched.names);
  } catch (err) {
    logger.debug(`[DETECTION_CATALOG] DS detector lookup skipped: ${err.message}`);
  }

  const dsSupportFor = (settingType) => {
    if (!dsNames) return null;
    const { detectors } = dsDetectorsForModes(DETECTION_MODES_MAP[settingType] || []);
    return detectors.length > 0 && detectors.every((name) => dsNames.has(name));
  };

  const before = await DetectionCatalog.find({ settingType: { $in: settingTypes } })
    .select("settingType")
    .lean();
  const known = new Set(before.map((row) => row.settingType));

  await DetectionCatalog.bulkWrite(
    entries.map(([settingType, name]) => ({
      updateOne: {
        filter: { settingType },
        update: {
          $set: {
            name,
            active: true,
            source: "server",
            syncedAt: now,
            dsSupported: dsSupportFor(settingType),
          },
          $setOnInsert: { settingType },
        },
        upsert: true,
      },
    })),
  );

  // Anything in the collection but no longer in the constants.
  const deactivated = await DetectionCatalog.updateMany(
    { settingType: { $nin: settingTypes }, active: true },
    { $set: { active: false, syncedAt: now } },
  );

  const result = {
    added: entries.length - known.size,
    updated: known.size,
    deactivated: deactivated.modifiedCount || 0,
    total: entries.length,
  };

  const unsupported = dsNames
    ? entries.map(([t]) => t).filter((t) => dsSupportFor(t) === false)
    : [];

  logger.info(
    `[DETECTION_CATALOG] synced ${result.total} types ` +
      `(added ${result.added}, updated ${result.updated}, deactivated ${result.deactivated})` +
      (dsNames
        ? ` — DS implements ${result.total - unsupported.length}/${result.total}` +
          (unsupported.length ? `, missing: ${unsupported.join(", ")}` : "")
        : " — DS unreachable, support flags left unchanged"),
  );
  result.dsUnsupported = unsupported;
  return result;
};

export default { syncDetectionCatalog };

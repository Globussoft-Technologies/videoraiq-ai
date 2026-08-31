import catalogModel from "./detectionCatalog.model.js";
import {
  DETECTION_TYPES2,
  DETECTION_DESCRIPTIONS,
} from "../../../constants/detectionTypes.js";
import logger from "../../../utils/logger.js";

/**
 * The detection types this superadmin should offer, resolved once and reused by
 * every screen that lists detections (Detection Catalog, Client Configuration).
 *
 * Source of truth is the shared `detectioncatalogs` collection, which the
 * client backend publishes from its own DETECTION_TYPES on boot. That backend
 * owns the list — a detection only works once it is implemented there — so
 * reading it is what stops the two hand-maintained constants files drifting.
 *
 * Falls back to this service's local DETECTION_TYPES2 when the collection is
 * empty, which is the case until the client backend has booted once with the
 * publishing code. The fallback keeps the screens working; it is just possibly
 * stale, which `stale: true` reports so the UI can say so.
 */
export const resolveDetectionTypes = async () => {
  try {
    const rows = await catalogModel
      .find({ active: true })
      .select("settingType name description syncedAt dsSupported")
      .sort({ createdAt: 1 })
      .lean();

    if (rows.length > 0) {
      return {
        stale: false,
        syncedAt: rows.reduce(
          (latest, row) => (row.syncedAt > latest ? row.syncedAt : latest),
          rows[0].syncedAt || null,
        ),
        detections: rows.map((row) => ({
          settingType: row.settingType,
          name: row.name,
          // false = DS answered and does not implement this detection, so it can
          // be licensed here but will never actually run. null = DS unreachable.
          dsSupported: row.dsSupported ?? null,
          // The catalog carries no descriptions yet; keep using the local copy
          // as presentation-only text, keyed by settingType.
          description: row.description || DETECTION_DESCRIPTIONS[row.settingType] || "",
        })),
      };
    }
  } catch (err) {
    logger.error(`resolveDetectionTypes: ${err.message}`);
  }

  return {
    stale: true,
    syncedAt: null,
    detections: Object.entries(DETECTION_TYPES2).map(([settingType, name]) => ({
      settingType,
      name,
      description: DETECTION_DESCRIPTIONS[settingType] || "",
      dsSupported: null,
    })),
  };
};

export default { resolveDetectionTypes };

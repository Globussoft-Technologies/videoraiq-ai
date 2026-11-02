/**
 * Is X-ray mode licensed for this admin?
 *
 * DECISION D1 (docs/xray/status_backend.md) — why this file exists instead of
 * one line in constants/detectionTypes.js.
 *
 * The plan's original instruction was to add an `xRayMode` entry to
 * `DETECTION_TYPES` and let the existing licence machinery gate it. Tracing
 * that catalogue showed it cannot be done without a visible change to a
 * deployment that has X-ray switched off:
 *
 *   * `GET /api/v2/detection-settings/types` would list "X-ray mode" in the
 *     existing create-a-detection dropdown, as though it were a configurable
 *     zone detection;
 *   * `getLicenseState` would return a new row the client polls;
 *   * `syncDetectionCatalog` would republish it into Mongo for the superadmin.
 *
 * `DETECTION_TYPES` is a module-scope constant read at import time by dozens of
 * call sites, so `XRAY_ENABLED` cannot gate any of that. Contract §3 requires
 * off to be byte-identical to today. Hence: the licence KEY is `xRayMode`, but
 * it is not a member of that catalogue, and this file reads the allocation
 * collection directly.
 *
 *
 * HOW A LICENCE IS GRANTED — read this before concluding the gate is broken
 *
 * `ClientDetectionAllocation` constrains `settingType` with
 * `enum: Object.keys(DETECTION_TYPES)` (core/v1/clientConfig/
 * clientDetectionAllocation.model.js:17). Reads ignore a schema enum, so this
 * file works; WRITES do not. The superadmin service has its own copy of both
 * the model and the constants (server-superadmin/core/v1/clientConfig/
 * clientDetectionAllocation.model.js:17), with the same enum.
 *
 * So an `xRayMode` row CANNOT currently be created through the superadmin UI.
 * Two ways to grant the licence, both outside this repo's lane:
 *
 *   1. add `xRayMode` to the SUPERADMIN's constants/detectionTypes.js — that
 *      service owns the write path, and its catalogue does not feed this
 *      backend's detection dropdown;
 *   2. insert the row straight into Mongo, which bypasses Mongoose validation:
 *        db.clientdetectionallocations.insertOne({
 *          adminId: ObjectId("..."), settingType: "xRayMode",
 *          cameraAllocation: 0, enabled: true,
 *          cameraSelectionConfigured: false,
 *          createdAt: new Date(), updatedAt: new Date() })
 *
 * Until one of those happens, a cloud deployment with licensing ENFORCED will
 * deny X-ray to everyone. That is the correct failing direction — closed, not
 * open — and `XRAY_LICENSE_CHECK=off` is the documented escape hatch. It does
 * not affect an on-premise install, where platform licensing is off wholesale
 * and the `auto` default makes this gate a no-op.
 *
 *
 * WHAT IS DELIBERATELY NOT CHECKED
 *
 * Only rule 3 of the platform's three licence rules applies — "does this client
 * have this detection at all". The camera-count rules do not:
 *
 *   * the per-detection camera allocation caps how many cameras may RUN a
 *     detection continuously. An X-ray session is a few minutes of one
 *     operator looking at one camera; it starts no pipeline and leaves nothing
 *     enabled behind.
 *   * the purchased-camera licence counts cameras with a detection enabled
 *     (Channel pre-save sets control=1). X-ray never enables one, so it
 *     consumes no camera licence.
 *
 * Capacity is enforced where it is actually scarce: the GPU. The service
 * answers `503 max_sessions_reached` (contract §6), which is a real limit on a
 * real resource rather than a count of cameras.
 */
import allocationModel from "../clientConfig/clientDetectionAllocation.model.js";
import { isLicensingEnforced, resolveTenant } from "../clientConfig/detectionLicense.service.js";
import logger from "../../../utils/logger.js";
import { xrayLicenseCheckMode, xrayLicenseSettingType } from "./xray.config.js";

/**
 * Should the gate run at all?
 *
 *   "off"  never — XRAY_ENABLED is then the only switch
 *   "on"   always, even on-premise
 *   "auto" follow the platform's own LICENSING_ENABLED (the default)
 *
 * `auto` is the default so that an on-premise install — where the customer owns
 * the box and there is no superadmin to license anything — does not suddenly
 * need an allocation row for a feature it already paid for.
 */
export const isXrayLicenceChecked = () => {
  const mode = xrayLicenseCheckMode();
  if (mode === "off") return false;
  if (mode === "on") return true;
  return isLicensingEnforced();
};

/**
 * `{ ok: true }` or `{ ok: false, reason }`.
 *
 * FAILS CLOSED. A database error here returns not-licensed rather than
 * allowing: the alternative is that a Mongo blip silently grants a paid
 * feature to every client, and the cost of being wrong in this direction is
 * one support ticket.
 *
 * @param {object} actor { adminId, userId }
 */
export const assertXrayLicensed = async (actor = {}) => {
  if (!isXrayLicenceChecked()) return { ok: true };

  const settingType = xrayLicenseSettingType();

  try {
    // The token's adminId is the normal path; resolveTenant also accepts a bare
    // user_id, which is what a token issued before adminId was stamped carries.
    const admin = await resolveTenant({ adminId: actor.adminId, userId: actor.userId });
    if (!admin?._id) {
      logger.warn(`[XRAY] licence: no tenant resolved for adminId=${actor.adminId}`);
      return { ok: false, reason: "tenant_not_resolved" };
    }

    const allocation = await allocationModel
      .findOne({ adminId: admin._id, settingType, enabled: true })
      .select("_id")
      .lean();

    if (allocation) return { ok: true };

    logger.info(
      `[XRAY] licence: ${settingType} is not allocated to admin ${admin._id} — denying X-ray`,
    );
    return { ok: false, reason: "not_allocated" };
  } catch (error) {
    logger.error(`[XRAY] licence check failed, denying: ${error?.message || error}`);
    return { ok: false, reason: "check_failed" };
  }
};

export default { isXrayLicenceChecked, assertXrayLicensed };

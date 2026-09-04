import axios from "axios";
import config from "config";
import logger from "../utils/logger.js";
import { resolveAdminEndpoints } from "../utils/adminEndpoints.js";

// axios defaults to no timeout, so a hung face-recognition service would keep
// a registration request (and anything it holds) alive forever.
const FACE_SERVICE_TIMEOUT_MS = 60_000;

// Percent-encode each path segment so filenames with spaces/#/&/unicode build
// valid, fetchable URLs; the /api/v1/uploads route decodes them back.
const toMediaUrl = (domain, p) =>
  `${domain}/api/v1/uploads${String(p ?? "").split("/").map(encodeURIComponent).join("/")}`;

/**
 * DS speaks in terse internal strings ("No valid face detected"). Those reach
 * the admin verbatim today, so map the known ones to something a non-technical
 * user can act on and keep the raw text only as a last resort.
 */
export function friendlyDSMessage(error) {
  const raw = error?.response?.data?.message || error?.response?.data?.detail || "";

  if (/already registered/i.test(raw)) {
    return "This person already has a face registered in the system. Search for the existing user instead of creating a new one.";
  }
  if (/no valid face|face not detected|no face/i.test(raw)) {
    return "We couldn't find a clear face in the photo you uploaded. Please use a well-lit, front-facing photo where the face isn't covered, then try again.";
  }
  if (/multiple faces/i.test(raw)) {
    return "The photo has more than one face in it. Please upload a photo with only this person in the frame.";
  }
  if (error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "")) {
    return "The face recognition service is taking too long to respond. Nothing was saved — please try again in a moment.";
  }
  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"].includes(error?.code)) {
    return "We couldn't reach the face recognition service. Nothing was saved — please try again shortly or contact support if this keeps happening.";
  }
  return raw || "The face recognition service rejected this registration. Nothing was saved — please try again.";
}

class DSUserSyncService {
  getDbName(adminId) {
    return `${adminId.toString()}_faces`;
  }

  // Payload shape shared by /register and /onfly_registration.
  _userPayload(authorizedUser) {
    return {
      uid: authorizedUser._id?.toString(),
      firstName: authorizedUser.firstName || "",
      lastName: authorizedUser.lastName || "",
      email: authorizedUser.email || "",
      department: authorizedUser.departmentId?.departmentName || "",
      branch: authorizedUser.branch || "",
      designation: authorizedUser.designation || "",
      admin_id: authorizedUser.adminId?.toString(),
      db: this.getDbName(authorizedUser.adminId),
    };
  }

  /**
   * Enroll uploaded face images against a uid via the DS /register API — the
   * same call the full Register User flow makes. THROWS on failure: callers
   * that must not persist a half-registered user depend on that.
   */
  async registerFaces(authorizedUser, profilePics = []) {
    const payload = {
      ...this._userPayload(authorizedUser),
      profileImages: (Array.isArray(profilePics) ? profilePics : [])
        .map((pic) => toMediaUrl(config.get("backendDomain"), pic)),
    };

    const { dsAuthUsersAPI } = await resolveAdminEndpoints(authorizedUser.adminId);
    const response = await axios.post(`${dsAuthUsersAPI}/register`, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: FACE_SERVICE_TIMEOUT_MS,
    });
    logger.info("DS register succeeded:", response.data);
    return response.data;
  }

  /**
   * Link a dsId's already-captured face images to a uid via onfly_registration.
   * THROWS on failure — use syncUser() for the fire-and-forget variant.
   */
  async registerOnFly(authorizedUser, dsId) {
    const payload = { ...this._userPayload(authorizedUser), dsId };

    const { dsAuthUsersAPI } = await resolveAdminEndpoints(authorizedUser.adminId);
    const response = await axios.post(`${dsAuthUsersAPI}/onfly_registration`, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: FACE_SERVICE_TIMEOUT_MS,
    });
    logger.info("DS onfly_registration succeeded:", response.data);
    return response.data;
  }

  /**
   * Best-effort removal of a uid from the DS face DB. Used to undo a successful
   * /register when a later step fails, so DS isn't left holding a user our DB
   * never stored. Never throws.
   */
  async deleteUser(adminId, uid) {
    try {
      if (!adminId || !uid) return;
      const { dsAuthUsersAPI } = await resolveAdminEndpoints(adminId);
      await axios.delete(
        `${dsAuthUsersAPI}/delete?uid=${uid}&db=${this.getDbName(adminId)}`,
        { timeout: FACE_SERVICE_TIMEOUT_MS }
      );
      logger.info(`DS rollback delete succeeded for uid ${uid}`);
    } catch (error) {
      logger.error("DS rollback delete failed:", error?.response?.data || error.message);
    }
  }

  /**
   * Notify the Data Science team's onfly_registration API whenever an
   * Authorized User is registered or tagged against a dsId. Non-blocking:
   * never throws, so a DS outage cannot fail the caller's flow.
   */
  async syncUser(authorizedUser, dsId) {
    try {
      if (!authorizedUser) return;
      await this.registerOnFly(authorizedUser, dsId);
    } catch (error) {
      logger.error("DS onfly_registration sync failed:", error?.response?.data || error.message);
    }
  }

  /**
   * Notify the Data Science team's delete_onfly API when face images are
   * deleted for a dsId. Non-blocking: never throws, so a DS outage cannot
   * fail the caller's delete flow.
   */
  async syncDeletedImages(adminId, dsId, images) {
    try {
      if (!dsId || !images?.length) return;

      const payload = {
        admin_id: adminId?.toString(),
        dsId,
        images,
      };

      const { dsAuthUsersAPI } = await resolveAdminEndpoints(adminId);
      const response = await axios.post(
        `${dsAuthUsersAPI}/delete_onfly`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
      logger.info("DS delete_onfly sync succeeded:", response.data);
    } catch (error) {
      logger.error("DS delete_onfly sync failed:", error?.response?.data || error.message);
    }
  }
}

export default new DSUserSyncService();

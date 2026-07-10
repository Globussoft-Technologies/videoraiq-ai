import axios from "axios";
import logger from "./logger.js";
import { resolveAdminEndpoints } from "./adminEndpoints.js";

// Fire-and-forget: POST { admin_id } to the admin's detection AND face-auth
// (attendance) services at the given endpoint paths. Never throws or blocks the
// caller — whatever the services return is ignored; failures are only logged.
// Both calls fire independently (one failing can't affect the other). Safe to
// call from a request/login flow without awaiting.
const postToStreamServices = (adminId, { detectionPath, attendancePath, tag }) => {
  try {
    if (!adminId) return;
    const body = { admin_id: String(adminId) };
    const opts = { headers: { "Content-Type": "application/json" }, timeout: 5000 };

    resolveAdminEndpoints(adminId)
      .then(({ detectionUrl, attendanceUrl }) => {
        // Object detection service
        if (detectionUrl) {
          axios
            .post(`${detectionUrl}${detectionPath}`, body, opts)
            .catch((err) =>
              logger.error(
                `[${tag}] detection failed for admin ${adminId}:`,
                err?.response?.data || err.message,
              ),
            );
        }
        // Face-auth / attendance service (attendanceUrl already ends in /face-auth)
        if (attendanceUrl) {
          axios
            .post(`${attendanceUrl}${attendancePath}`, body, opts)
            .catch((err) =>
              logger.error(
                `[${tag}] face-auth failed for admin ${adminId}:`,
                err?.response?.data || err.message,
              ),
            );
        }
      })
      .catch((err) => {
        logger.error(
          `[${tag}] failed to resolve endpoints for admin ${adminId}:`,
          err?.message,
        );
      });
  } catch (err) {
    // Absolute safety net — this must never break the caller (e.g. login).
    logger.error(`[${tag}] unexpected error:`, err?.message);
  }
};

// On plan expiry — stop all of the admin's detection + face-auth streams.
export const stopAllStreams = (adminId) =>
  postToStreamServices(adminId, {
    detectionPath: "/stream/stop-all",
    attendancePath: "/api/v1/cameras/stop-all",
    tag: "PLAN_EXPIRED",
  });

// On plan re-activation — resume all of the admin's detection + face-auth streams.
export const resumeAllStreams = (adminId) =>
  postToStreamServices(adminId, {
    detectionPath: "/stream/resume-all",
    attendancePath: "/api/v1/cameras/resume-all",
    tag: "PLAN_RESUMED",
  });

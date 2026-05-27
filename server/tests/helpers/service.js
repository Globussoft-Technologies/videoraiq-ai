/**
 * Helpers for service-layer integration tests.
 *
 * The `core/v1/*` services take `(req, res, next)` and respond with
 * `res.status(X).json(Response.xxx(...))`. The Response helper itself returns
 * `{ statusCode, body }`, so the captured response is double-nested:
 *   res._body          → { statusCode, body }
 *   res._body.body     → { status, message, data | error }
 * `payload(res)` unwraps that inner object.
 */
import { makeReqRes } from "./factory.js";

/**
 * Build a req/res/next triple with an authenticated user attached.
 * Pass `body`, `query`, `params` (and optional `orgId` / `memberId` /
 * `authorizedChannel`) to shape the request.
 */
export function serviceCtx({
  adminId,
  orgId,
  memberId,
  user_id,
  user_email,
  authorizedChannel,
  permissionConfig,
  body,
  query,
  params,
} = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = {
    userData: {
      adminId: adminId != null ? String(adminId) : undefined,
      orgId,
      memberId,
      user_id,
      user_email,
    },
    authorizedChannel,
    permissionConfig,
  };
  if (body) req.body = body;
  if (query) req.query = query;
  if (params) req.params = params;
  return { req, res, next };
}

/** Unwrap the response body. Handles both Response-wrapped and direct json() calls. */
export const payload = (res) => {
  if (!res._body) return undefined;
  // If _body.body exists (from res.status().json(response.body)), use the inner body
  if (res._body.body && typeof res._body.body === 'object') {
    return res._body.body;
  }
  // Otherwise _body is the raw object (from direct res.json() calls)
  return res._body;
};

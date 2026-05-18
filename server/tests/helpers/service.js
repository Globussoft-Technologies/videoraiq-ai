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
  authorizedChannel,
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
    },
    authorizedChannel,
  };
  if (body) req.body = body;
  if (query) req.query = query;
  if (params) req.params = params;
  return { req, res, next };
}

/** Unwrap the double-nested response body → { status, message, data | error }. */
export const payload = (res) => res._body?.body;

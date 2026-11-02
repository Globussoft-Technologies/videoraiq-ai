const codes = { 400: "INVALID_REQUEST", 401: "AUTHENTICATION_REQUIRED", 403: "ACCESS_DENIED", 404: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_FAILED", 429: "RATE_LIMITED" };

export function normalizeV2Error(payload, httpStatus) {
  if (!payload || typeof payload !== "object" || Buffer.isBuffer(payload)) return payload;
  const body = payload.body || payload;
  const status = Number(payload.statusCode) >= 400 ? Number(payload.statusCode) : httpStatus;
  if (status < 400 && !["failed", "error"].includes(body.status)) return payload;
  const errorCode = body.errorCode || body.error?.code || codes[status] || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED");
  return { statusCode: status >= 400 ? status : 400, body: {
    status: "failed", message: body.message || "Request failed.", errorCode,
    ...(body.data !== undefined ? { data: body.data } : {}),
  } };
}

export default function v2ErrorContract(req, res, next) {
  const json = res.json.bind(res);
  res.json = (payload) => {
    // The Phase 1 agent proxy mirrors the upstream agent's flat error shape.
    if (/\/agent-chat(?:\/|$)/.test((req.originalUrl || "").split("?")[0]) && payload?.errorCode) return json(payload);
    const normalized = normalizeV2Error(payload, res.statusCode);
    if (normalized !== payload && res.statusCode < 400) res.status(normalized.statusCode);
    return json(normalized);
  };
  next();
}

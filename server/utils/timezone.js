export const DEFAULT_ADMIN_TIMEZONE = "Asia/Kolkata";

export function validTimezone(value) {
  if (!value || typeof value !== "string") return null;
  const timezone = value.trim();
  if (!timezone) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return null;
  }
}

/**
 * The authenticated admin timezone is the single application timezone.
 * verifyToken refreshes this claim from the Admin document on every request,
 * so callers must not accept a browser or query-string override.
 */
export function getRequestTimezone(req) {
  return validTimezone(req?.verified?.userData?.timezone) || DEFAULT_ADMIN_TIMEZONE;
}

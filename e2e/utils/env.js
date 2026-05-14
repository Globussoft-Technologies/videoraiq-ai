/**
 * Resolves the auth cookie name based on the target environment.
 * Matches the logic in client/src/utils/getAccessToken.js:
 *   - dev   → dev-access-token
 *   - prod  → prod-access-token
 *   - local → access-token
 */
export function authCookieName() {
  return process.env.AUTH_COOKIE_NAME || "dev-access-token";
}

export function isDestructiveAllowed() {
  return process.env.ALLOW_DESTRUCTIVE_TESTS === "true";
}

export function baseUrl() {
  return process.env.BASE_URL || "https://dev.videoraiq.com";
}

export function loginPath() {
  return process.env.LOGIN_PATH || "/login";
}

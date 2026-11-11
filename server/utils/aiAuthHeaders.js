import config from "config";

// Read at request time so bootstrap/dotenv can populate the environment first.
export const aiAuthHeaders = ({ admin = false } = {}) => {
  const headers = {};
  const bearer = process.env.API_AUTH_BEARER?.trim() ||
    (config.has("API_AUTH_BEARER") ? config.get("API_AUTH_BEARER")?.trim() : "");
  const adminSecret = process.env.ADMIN_API_SECRET?.trim() ||
    (config.has("ADMIN_API_SECRET") ? config.get("ADMIN_API_SECRET")?.trim() : "");
  // Unconfigured installations can still call AI servers in off/observe mode.
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (admin && adminSecret) headers["X-Admin-Secret"] = adminSecret;
  return headers;
};

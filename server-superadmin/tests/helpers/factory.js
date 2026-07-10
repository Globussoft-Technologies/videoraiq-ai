/**
 * Lightweight in-memory factories for test data.
 * Avoid hitting Mongoose directly — these are plain objects you can hand to
 * controllers/services after mocking the model layer.
 */
import jwt from "jsonwebtoken";
import config from "config";

let userSeq = 1;

export function makeUser(overrides = {}) {
  const id = userSeq++;
  return {
    _id: `00000000000000000000000${id}`.slice(-24),
    user_id: 100 + id,
    admin_id: 1,
    email: `user${id}@test.com`,
    firstName: "Test",
    lastName: `User${id}`,
    name_f: `Test User${id}`,
    isActive: true,
    isPlanActive: true,
    roleIds: ["role_admin"],
    permissionConfig: completePermissionConfig(),
    ...overrides,
  };
}

export function makeAdmin(overrides = {}) {
  return {
    _id: "000000000000000000000001",
    user_id: 1,
    admin_id: 1,
    email: "admin@test.com",
    firstName: "Admin",
    lastName: "Root",
    name_f: "Admin Root",
    subscriptions: { active: true, expiresAt: futureTimestamp() },
    ...overrides,
  };
}

export function makeRole(overrides = {}) {
  return {
    _id: "role_admin",
    roleName: "Administrator",
    adminId: 1,
    permissionId: "perm_complete",
    ...overrides,
  };
}

export function makePermissionConfig(overrides = {}) {
  return {
    dashboard: { view: true },
    incidents: { view: true, create: true, edit: true, delete: true },
    NVR: { view: true, create: true, edit: true, delete: true },
    channels: { view: true, create: true, edit: true, delete: true },
    Users: { view: true, create: true, edit: true, delete: true },
    ...overrides,
  };
}

/**
 * Mirrors the keys + casing of `core/v1/permission/permissions.config.js`
 * `completeConfig` (flipped to `true` for every leaf). Keep this in sync
 * with the source — the `permissionConfigChecker` maps URL prefixes to
 * these exact keys, and a key mismatch surfaces as a silent permission
 * denial.
 */
export function completePermissionConfig() {
  const yes = { view: true, create: true, edit: true, delete: true };
  return {
    NVR: { ...yes },
    channels: { ...yes },
    LIVE: { ...yes },
    dashboard: { ...yes },
    incidents: { ...yes },
    Users: { ...yes },
    permission: { ...yes },
    roles: { ...yes },
    departments: { ...yes },
    detectionSettings: { ...yes },
    profiles: { ...yes },
    recipients: { ...yes },
    logs: {
      global: { ...yes },
      accessLogs: { ...yes },
      attendanceLogs: { ...yes },
      trackLogs: { ...yes },
      deskLogs: { ...yes },
      guardLogs: { ...yes },
      ANPRLogs: { ...yes },
    },
    locations: { ...yes },
    playbacks: { ...yes },
  };
}

export function emptyPermissionConfig() {
  return {
    dashboard: { view: false },
    incidents: { view: false, create: false, edit: false, delete: false },
    NVR: { view: false, create: false, edit: false, delete: false },
  };
}

export function signJwt(payload, opts = {}) {
  return jwt.sign(payload, config.get("jwt.secretKey"), {
    expiresIn: "1h",
    ...opts,
  });
}

export function futureTimestamp(secondsFromNow = 86_400) {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

export function pastTimestamp(secondsAgo = 86_400) {
  return Math.floor(Date.now() / 1000) - secondsAgo;
}

export function makeReqRes() {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    cookies: {},
    method: "GET",
    path: "/",
    originalUrl: "/",
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };
  const res = {
    statusCode: 200,
    _body: undefined,
    _headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this._body = payload;
      return this;
    },
    send(payload) {
      this._body = payload;
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
      return this;
    },
    end() {
      return this;
    },
  };
  const next = (err) => {
    next.calls.push(err);
  };
  next.calls = [];
  return { req, res, next };
}

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
    email: `user${id}@test.local`,
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
    email: "admin@test.local",
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
    users: { view: true, create: true, edit: true, delete: true },
    ...overrides,
  };
}

export function completePermissionConfig() {
  return {
    dashboard: { view: true },
    incidents: { view: true, create: true, edit: true, delete: true },
    NVR: { view: true, create: true, edit: true, delete: true },
    channels: { view: true, create: true, edit: true, delete: true },
    users: { view: true, create: true, edit: true, delete: true },
    roles: { view: true, create: true, edit: true, delete: true },
    permissions: { view: true, create: true, edit: true, delete: true },
    storage: { view: true, create: true, edit: true, delete: true },
    detection: { view: true, create: true, edit: true, delete: true },
    attendance: { view: true, create: true, edit: true, delete: true },
    departments: { view: true, create: true, edit: true, delete: true },
    locations: { view: true, create: true, edit: true, delete: true },
    profiles: { view: true, create: true, edit: true, delete: true },
    settings: { view: true, create: true, edit: true, delete: true },
    logs: { view: true, create: true, edit: true, delete: true },
    LIVE: { view: true },
    playbacks: { view: true },
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

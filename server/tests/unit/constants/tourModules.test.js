import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import {
  TOUR_MODULES,
  isModuleVisible,
  isModuleLogEnabled,
  matchesSearch,
  normalizePermissionConfig,
} from "../../../constants/tourModules.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const NAV_CONFIG = path.resolve(
  here,
  "../../../../client_v2/src/layout/nav.config.js",
);

/**
 * The server's tour catalogue is a copy of the client's sidebar config: the
 * client owns routing, the server owns "which modules may this user tour, and
 * which match this search". A copy can go stale silently, and the failure mode
 * is bad — a module quietly missing from the tour menu — so this pins the two
 * together.
 */
describe("tour module catalogue", () => {
  it("has no duplicate keys", () => {
    const keys = TOUR_MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every module a key, label, path and group", () => {
    for (const module of TOUR_MODULES) {
      expect(module.key, JSON.stringify(module)).toBeTruthy();
      expect(module.label, module.key).toBeTruthy();
      expect(module.path, module.key).toBeTruthy();
      expect(module.group, module.key).toBeTruthy();
    }
  });

  // Skips rather than fails when the client isn't checked out beside the server
  // (some deployments ship the API alone), so this can't break their CI.
  const navExists = fs.existsSync(NAV_CONFIG);

  it.skipIf(!navExists)("stays in step with the client's nav.config.js", () => {
    const src = fs.readFileSync(NAV_CONFIG, "utf8");

    // Every non-commented nav item the client declares, by key. Items inside a
    // `hidden: true` group are excluded there and here alike, so compare only
    // the keys the server claims to know about plus any the client has gained.
    const clientKeys = new Set();
    for (const line of src.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//")) continue;
      const match = trimmed.match(/^\{\s*key:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'/);
      if (match) clientKeys.add(match[1]);
    }

    // Anything the server lists must still exist in the client's nav config.
    const stale = TOUR_MODULES.filter((m) => !clientKeys.has(m.key)).map((m) => m.key);
    expect(
      stale,
      `tourModules.js lists modules nav.config.js no longer has: ${stale.join(", ")}`,
    ).toEqual([]);

    // And every label must match, so a rename on one side is caught too.
    const labelByKey = new Map();
    for (const line of src.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//")) continue;
      const match = trimmed.match(/^\{\s*key:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'/);
      if (match) labelByKey.set(match[1], match[2]);
    }
    const renamed = TOUR_MODULES.filter(
      (m) => labelByKey.get(m.key) && labelByKey.get(m.key) !== m.label,
    ).map((m) => `${m.key}: "${m.label}" vs "${labelByKey.get(m.key)}"`);
    expect(renamed, `labels drifted from nav.config.js: ${renamed.join("; ")}`).toEqual([]);
  });
});

describe("tour module filtering", () => {
  const logsModule = TOUR_MODULES.find((m) => m.logsConfigKey);
  const permModule = TOUR_MODULES.find((m) => m.permissionKey && !m.permissionSubKey);

  it("shows everything when permissions have not resolved", () => {
    // Fails open, matching the client's isItemVisible(): a lookup problem must
    // never strip a user of navigation they are entitled to.
    expect(isModuleVisible(permModule, {})).toBe(true);
    expect(isModuleVisible(permModule, null)).toBe(true);
  });

  it("hides a module the role cannot view", () => {
    expect(isModuleVisible(permModule, { [permModule.permissionKey]: { view: false } })).toBe(
      false,
    );
    expect(isModuleVisible(permModule, { [permModule.permissionKey]: { view: true } })).toBe(true);
  });

  it("honours a sub-key, including the global fallback", () => {
    const sub = TOUR_MODULES.find((m) => m.permissionSubKey);
    expect(
      isModuleVisible(sub, { [sub.permissionKey]: { [sub.permissionSubKey]: { view: true } } }),
    ).toBe(true);
    expect(isModuleVisible(sub, { [sub.permissionKey]: { global: { view: true } } })).toBe(true);
    expect(isModuleVisible(sub, { [sub.permissionKey]: { other: { view: true } } })).toBe(false);
  });

  it("only hides a log page when its config says false", () => {
    expect(isModuleLogEnabled(logsModule, null)).toBe(true);
    expect(isModuleLogEnabled(logsModule, {})).toBe(true);
    expect(isModuleLogEnabled(logsModule, { [logsModule.logsConfigKey]: false })).toBe(false);
  });

  it("matches search on name and on sidebar group", () => {
    const attendance = TOUR_MODULES.find((m) => m.key === "attendance");
    expect(matchesSearch(attendance, "")).toBe(true);
    expect(matchesSearch(attendance, "atten")).toBe(true);
    expect(matchesSearch(attendance, "ATTEN")).toBe(true);
    // group match: "logs" should find the whole LOGS & RECORDS section
    expect(matchesSearch(attendance, "records")).toBe(true);
    expect(matchesSearch(attendance, "zzzz")).toBe(false);
  });

  it("fills in settings for roles stored before that module existed", () => {
    expect(normalizePermissionConfig({ dashboard: {} }, "admin").settings.view).toBe(true);
    expect(normalizePermissionConfig({ dashboard: {} }, "read").settings.view).toBe(true);
    expect(normalizePermissionConfig({ dashboard: {} }, "read").settings.delete).toBe(false);
    // A custom role gets nothing until an admin grants it explicitly.
    expect(normalizePermissionConfig({ dashboard: {} }, "floor-manager").settings.view).toBe(false);
    // An existing settings block is never overwritten.
    const explicit = { settings: { view: false } };
    expect(normalizePermissionConfig(explicit, "admin")).toBe(explicit);
  });
});

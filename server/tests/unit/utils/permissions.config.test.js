/**
 * Unit tests for core/v1/permission/permissions.config.js
 *
 * The module is a pure named-export bundle of four permission-config
 * templates — `completeConfig` (all-false), `adminConfig` (all-true),
 * `readConfig` (view-only), `writeConfig` (view+create+edit, delete-only-false).
 * These templates are the contract used by the permission/roles system to
 * seed default role permissions (see `permissions.utility.js`, the
 * permission factory in `tests/helpers/factory.js`, and the validation
 * suite that re-imports them).
 *
 * Pure data + no side effects → shape assertions are sufficient to pin
 * the contract and bring the file to 100% line coverage. No mocks needed.
 *
 * R101 — server phase (test-only).
 */
import { describe, it, expect } from "vitest";

const {
  completeConfig,
  adminConfig,
  readConfig,
  writeConfig,
} = await import("../../../core/v1/permission/permissions.config.js");

// Top-level keys every flat-section template must carry. The `logs` key is
// nested (sub-sections) and `playbacks` is the most-recently-added top-level
// section — these get verified separately.
const FLAT_SECTIONS = [
  "NVR",
  "channels",
  "LIVE",
  "dashboard",
  "incidents",
  "Users",
  "permission",
  "roles",
  "departments",
  "detectionSettings",
  "profiles",
  "recipients",
  "locations",
  "playbacks",
];

const LOG_SUBSECTIONS = [
  "global",
  "accessLogs",
  "attendanceLogs",
  "taggedUsersLogs",
  "detectedUsersLogs",
  "personCountLogs",
  "productivityLogs",
  "visibilityLogs",
  "trackLogs",
  "deskLogs",
  "guardLogs",
  "ANPRLogs",
  "conveyorLogs",
  "crusherLogs",
  "lineCrossingLogs",
  "unauthorizedAccessLogs",
  "vehicleCountLogs",
  "vehicleObstructionLogs",
  "waterSpillLogs",
];

const CRUD_KEYS = ["view", "create", "edit", "delete"];

function assertCrudShape(node) {
  expect(Object.keys(node).sort()).toEqual([...CRUD_KEYS].sort());
  for (const k of CRUD_KEYS) {
    expect(node[k]).toBeTypeOf("boolean");
  }
}

function assertTopLevelShape(cfg) {
  // Every flat section must be a CRUD object…
  for (const section of FLAT_SECTIONS) {
    expect(cfg).toHaveProperty(section);
    assertCrudShape(cfg[section]);
  }
  // …and `logs` must be a sub-section bag of CRUD objects.
  expect(cfg).toHaveProperty("logs");
  expect(Object.keys(cfg.logs).sort()).toEqual([...LOG_SUBSECTIONS].sort());
  for (const sub of LOG_SUBSECTIONS) {
    assertCrudShape(cfg.logs[sub]);
  }
}

describe("permissions.config — completeConfig (all-false template)", () => {
  it("exports an object", () => {
    expect(completeConfig).toBeTypeOf("object");
    expect(completeConfig).not.toBeNull();
  });

  it("has every documented top-level section + nested `logs` sub-sections", () => {
    assertTopLevelShape(completeConfig);
  });

  it("every flat-section CRUD bit is false", () => {
    for (const section of FLAT_SECTIONS) {
      for (const k of CRUD_KEYS) {
        expect(completeConfig[section][k]).toBe(false);
      }
    }
  });

  it("every logs sub-section CRUD bit is false", () => {
    for (const sub of LOG_SUBSECTIONS) {
      for (const k of CRUD_KEYS) {
        expect(completeConfig.logs[sub][k]).toBe(false);
      }
    }
  });
});

describe("permissions.config — adminConfig (all-true template)", () => {
  it("has every documented top-level section + nested `logs` sub-sections", () => {
    assertTopLevelShape(adminConfig);
  });

  it("every flat-section CRUD bit is true", () => {
    for (const section of FLAT_SECTIONS) {
      for (const k of CRUD_KEYS) {
        expect(adminConfig[section][k]).toBe(true);
      }
    }
  });

  it("every logs sub-section CRUD bit is true", () => {
    for (const sub of LOG_SUBSECTIONS) {
      for (const k of CRUD_KEYS) {
        expect(adminConfig.logs[sub][k]).toBe(true);
      }
    }
  });
});

describe("permissions.config — readConfig (view-only template)", () => {
  it("has every documented top-level section + nested `logs` sub-sections", () => {
    assertTopLevelShape(readConfig);
  });

  it("every flat-section grants view but denies create/edit/delete", () => {
    for (const section of FLAT_SECTIONS) {
      expect(readConfig[section].view).toBe(true);
      expect(readConfig[section].create).toBe(false);
      expect(readConfig[section].edit).toBe(false);
      expect(readConfig[section].delete).toBe(false);
    }
  });

  it("every logs sub-section grants view but denies create/edit/delete", () => {
    for (const sub of LOG_SUBSECTIONS) {
      expect(readConfig.logs[sub].view).toBe(true);
      expect(readConfig.logs[sub].create).toBe(false);
      expect(readConfig.logs[sub].edit).toBe(false);
      expect(readConfig.logs[sub].delete).toBe(false);
    }
  });
});

describe("permissions.config — writeConfig (view+create+edit, no delete)", () => {
  it("has every documented top-level section + nested `logs` sub-sections", () => {
    assertTopLevelShape(writeConfig);
  });

  it("every flat-section allows view/create/edit but blocks delete", () => {
    for (const section of FLAT_SECTIONS) {
      expect(writeConfig[section].view).toBe(true);
      expect(writeConfig[section].create).toBe(true);
      expect(writeConfig[section].edit).toBe(true);
      expect(writeConfig[section].delete).toBe(false);
    }
  });

  it("every logs sub-section allows view/create/edit but blocks delete", () => {
    for (const sub of LOG_SUBSECTIONS) {
      expect(writeConfig.logs[sub].view).toBe(true);
      expect(writeConfig.logs[sub].create).toBe(true);
      expect(writeConfig.logs[sub].edit).toBe(true);
      expect(writeConfig.logs[sub].delete).toBe(false);
    }
  });
});

describe("permissions.config — cross-template invariants", () => {
  it("all four templates share the exact same top-level key set", () => {
    const c = Object.keys(completeConfig).sort();
    const a = Object.keys(adminConfig).sort();
    const r = Object.keys(readConfig).sort();
    const w = Object.keys(writeConfig).sort();
    expect(a).toEqual(c);
    expect(r).toEqual(c);
    expect(w).toEqual(c);
  });

  it("all four templates share the exact same logs sub-section key set", () => {
    const c = Object.keys(completeConfig.logs).sort();
    const a = Object.keys(adminConfig.logs).sort();
    const r = Object.keys(readConfig.logs).sort();
    const w = Object.keys(writeConfig.logs).sort();
    expect(a).toEqual(c);
    expect(r).toEqual(c);
    expect(w).toEqual(c);
  });

  it("templates are independent mutable objects (let-exports), not shared refs", () => {
    // `completeConfig`, `adminConfig`, etc. are declared with `export let`,
    // so they are independent object instances even when their key sets match.
    expect(completeConfig).not.toBe(adminConfig);
    expect(completeConfig).not.toBe(readConfig);
    expect(completeConfig).not.toBe(writeConfig);
    expect(adminConfig).not.toBe(readConfig);
    expect(adminConfig).not.toBe(writeConfig);
    expect(readConfig).not.toBe(writeConfig);
    // The NVR sub-objects are also independent (no shared CRUD ref).
    expect(completeConfig.NVR).not.toBe(adminConfig.NVR);
  });

  it("`view` flag obeys precedence: complete < read = write = admin", () => {
    // Sanity: every section's `view` bit goes false→true at the
    // read/write/admin levels.
    for (const section of FLAT_SECTIONS) {
      expect(completeConfig[section].view).toBe(false);
      expect(readConfig[section].view).toBe(true);
      expect(writeConfig[section].view).toBe(true);
      expect(adminConfig[section].view).toBe(true);
    }
  });

  it("`delete` flag only ever flips true in adminConfig", () => {
    for (const section of FLAT_SECTIONS) {
      expect(completeConfig[section].delete).toBe(false);
      expect(readConfig[section].delete).toBe(false);
      expect(writeConfig[section].delete).toBe(false);
      expect(adminConfig[section].delete).toBe(true);
    }
    for (const sub of LOG_SUBSECTIONS) {
      expect(completeConfig.logs[sub].delete).toBe(false);
      expect(readConfig.logs[sub].delete).toBe(false);
      expect(writeConfig.logs[sub].delete).toBe(false);
      expect(adminConfig.logs[sub].delete).toBe(true);
    }
  });
});

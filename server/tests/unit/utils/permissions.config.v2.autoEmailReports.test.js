/**
 * Pins the `autoEmailReports` module defaults in the v2 permission templates.
 *
 * Product contract for the Auto Email Reports feature:
 *   admin    -> full control (view/create/edit/delete)
 *   write    -> everything except delete
 *   read     -> view only
 *   complete -> nothing (the all-false seed custom roles start from)
 *
 * These four templates are what `Auth/auth.service.js` seeds new admins with
 * and what the login-time backfill fills stale permission configs from, so a
 * drift here silently changes who can reach the reports UI.
 */
import { describe, it, expect } from "vitest";

const {
  completeConfig,
  adminConfig,
  readConfig,
  writeConfig,
} = await import("../../../core/v2/permission/permissions.config.js");

const CRUD_KEYS = ["view", "create", "edit", "delete"];

describe("v2 permissions.config — autoEmailReports", () => {
  it("is present as a full CRUD row in every template", () => {
    for (const cfg of [completeConfig, adminConfig, readConfig, writeConfig]) {
      expect(cfg.autoEmailReports).toBeDefined();
      expect(Object.keys(cfg.autoEmailReports).sort()).toEqual(
        [...CRUD_KEYS].sort(),
      );
      for (const key of CRUD_KEYS) {
        expect(cfg.autoEmailReports[key]).toBeTypeOf("boolean");
      }
    }
  });

  it("grants admin everything", () => {
    expect(adminConfig.autoEmailReports).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
  });

  it("grants write everything except delete", () => {
    expect(writeConfig.autoEmailReports).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: false,
    });
  });

  it("grants read view only", () => {
    expect(readConfig.autoEmailReports).toEqual({
      view: true,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("grants the all-false seed nothing", () => {
    expect(completeConfig.autoEmailReports).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("matches the delete-flag invariant: only admin may delete", () => {
    expect(completeConfig.autoEmailReports.delete).toBe(false);
    expect(readConfig.autoEmailReports.delete).toBe(false);
    expect(writeConfig.autoEmailReports.delete).toBe(false);
    expect(adminConfig.autoEmailReports.delete).toBe(true);
  });
});

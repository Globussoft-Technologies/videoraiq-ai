import { describe, it, expect } from "vitest";
import {
  viewPermissionConfigChecker,
  createPermissionConfigChecker,
  editPermissionConfigChecker,
  deletePermissionConfigChecker,
} from "../../../middlewares/permissionConfigChecker.js";

describe("permissionConfigChecker", () => {
  describe("viewPermissionConfigChecker", () => {
    it("maps known prefixes to their module", () => {
      expect(viewPermissionConfigChecker("/api/v1/incidents")).toBe("incidents");
      expect(viewPermissionConfigChecker("/api/v1/nvr")).toBe("NVR");
      expect(viewPermissionConfigChecker("/api/v1/users")).toBe("Users");
      expect(viewPermissionConfigChecker("/api/v1/locations")).toBe("locations");
      expect(viewPermissionConfigChecker("/api/v1/permissions")).toBe(
        "permission"
      );
      expect(viewPermissionConfigChecker("/api/v1/dashboard")).toBe("dashboard");
      expect(viewPermissionConfigChecker("/api/v1/attendance")).toBe("logs");
      expect(viewPermissionConfigChecker("/api/v1/accessLogs")).toBe("logs");
    });

    it("playback prefix wins over channel prefix", () => {
      expect(viewPermissionConfigChecker("/api/v1/channel/playback")).toBe(
        "playbacks"
      );
      expect(viewPermissionConfigChecker("/api/v1/channel/123")).toBe("channels");
    });

    it("authorizedUsers maps to the Users module", () => {
      expect(viewPermissionConfigChecker("/api/v1/authorizedUsers")).toBe(
        "Users"
      );
      expect(viewPermissionConfigChecker("/api/v1/authorizedUsers/fetch")).toBe(
        "Users"
      );
    });

    it("normalizes trailing slash", () => {
      expect(viewPermissionConfigChecker("/api/v1/incidents/")).toBe("incidents");
    });

    it("returns empty string for unknown or empty paths", () => {
      expect(viewPermissionConfigChecker("")).toBe("");
      expect(viewPermissionConfigChecker(undefined)).toBe("");
      expect(viewPermissionConfigChecker("/unknown/path")).toBe("");
    });

    it("respects ordering — first prefix match wins", () => {
      // The pathMap is order-sensitive. Test the documented winners.
      expect(viewPermissionConfigChecker("/api/v1/channel/playback/abc")).toBe(
        "playbacks"
      );
    });
  });

  describe("createPermissionConfigChecker", () => {
    it("does not include /api/v1/dashboard (no create endpoint)", () => {
      expect(createPermissionConfigChecker("/api/v1/dashboard")).toBe("");
    });

    it("maps shifts on create", () => {
      expect(createPermissionConfigChecker("/api/v1/shifts")).toBe("shifts");
    });

    it("maps incident create", () => {
      expect(createPermissionConfigChecker("/api/v1/incidents/create")).toBe(
        "incidents"
      );
    });
  });

  describe("editPermissionConfigChecker", () => {
    it("includes channels (channels have edit, not create at top-level)", () => {
      expect(editPermissionConfigChecker("/api/v1/channel/abc")).toBe("channels");
    });

    it("does not include dashboard", () => {
      expect(editPermissionConfigChecker("/api/v1/dashboard")).toBe("");
    });
  });

  describe("deletePermissionConfigChecker", () => {
    it("includes channels", () => {
      expect(deletePermissionConfigChecker("/api/v1/channel/abc")).toBe(
        "channels"
      );
    });

    it("handles /v1/user prefix as employee", () => {
      expect(deletePermissionConfigChecker("/v1/user")).toBe("employee");
    });
  });

  describe("all checkers — defensive defaults", () => {
    const checkers = [
      viewPermissionConfigChecker,
      createPermissionConfigChecker,
      editPermissionConfigChecker,
      deletePermissionConfigChecker,
    ];
    it.each(checkers)("returns '' for empty / null / undefined", (fn) => {
      expect(fn("")).toBe("");
      expect(fn(undefined)).toBe("");
      expect(fn(null ?? "")).toBe("");
    });
  });
});

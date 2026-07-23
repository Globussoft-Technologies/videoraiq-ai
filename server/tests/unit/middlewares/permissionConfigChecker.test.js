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
      expect(viewPermissionConfigChecker("/api/v2/incidents")).toBe("incidents");
      expect(viewPermissionConfigChecker("/api/v1/nvr")).toBe("NVR");
      expect(viewPermissionConfigChecker("/api/v2/nvr")).toBe("NVR");
      expect(viewPermissionConfigChecker("/api/v1/users")).toBe("Users");
      expect(viewPermissionConfigChecker("/api/v2/users")).toBe("Users");
      expect(viewPermissionConfigChecker("/api/v1/locations")).toBe("locations");
      expect(viewPermissionConfigChecker("/api/v2/locations")).toBe("locations");
      expect(viewPermissionConfigChecker("/api/v1/permissions")).toBe(
        "permission"
      );
      expect(viewPermissionConfigChecker("/api/v2/permissions")).toBe(
        "permission"
      );
      expect(viewPermissionConfigChecker("/api/v1/dashboard")).toBe("dashboard");
      expect(viewPermissionConfigChecker("/api/v2/dashboard")).toBe("dashboard");
      expect(viewPermissionConfigChecker("/api/v2/analytics")).toBe("dashboard");
      expect(viewPermissionConfigChecker("/api/v1/attendance")).toBe("logs");
      expect(viewPermissionConfigChecker("/api/v2/attendance")).toBe("logs");
      expect(viewPermissionConfigChecker("/api/v1/accessLogs")).toBe("logs");
      expect(viewPermissionConfigChecker("/api/v2/accessLogs")).toBe("logs");
      expect(viewPermissionConfigChecker("/api/v2/entry")).toBe("logs");
      expect(viewPermissionConfigChecker("/api/v2/vehicle")).toBe("logs");
    });

    it("playback prefix wins over channel prefix", () => {
      expect(viewPermissionConfigChecker("/api/v1/channel/playback")).toBe(
        "playbacks"
      );
      expect(viewPermissionConfigChecker("/api/v2/channel/playback")).toBe(
        "playbacks"
      );
      expect(viewPermissionConfigChecker("/api/v1/channel/123")).toBe("channels");
      expect(viewPermissionConfigChecker("/api/v2/channel/123")).toBe("channels");
    });

    it("authorizedUsers maps to the Users module", () => {
      expect(viewPermissionConfigChecker("/api/v1/authorizedUsers")).toBe(
        "Users"
      );
      expect(viewPermissionConfigChecker("/api/v2/authorizedUsers")).toBe(
        "Users"
      );
      expect(viewPermissionConfigChecker("/api/v1/authorizedUsers/fetch")).toBe(
        "Users"
      );
      expect(viewPermissionConfigChecker("/api/v2/authorizedUsers/fetch")).toBe(
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
      expect(viewPermissionConfigChecker("/api/v2/channel/playback/abc")).toBe(
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
      expect(createPermissionConfigChecker("/api/v2/shifts")).toBe("shifts");
    });

    it("maps incident create", () => {
      expect(createPermissionConfigChecker("/api/v1/incidents/create")).toBe(
        "incidents"
      );
      expect(createPermissionConfigChecker("/api/v2/incidents/create")).toBe(
        "incidents"
      );
    });

    it("maps v2 create routes to their modules", () => {
      expect(createPermissionConfigChecker("/api/v2/permissions/create")).toBe(
        "permission"
      );
      expect(createPermissionConfigChecker("/api/v2/locations/create")).toBe(
        "locations"
      );
      expect(createPermissionConfigChecker("/api/v2/users/create")).toBe("Users");
      expect(createPermissionConfigChecker("/api/v2/authorizedUsers/create")).toBe(
        "Users"
      );
      expect(createPermissionConfigChecker("/api/v2/detection-settings")).toBe(
        "detectionSettings"
      );
      expect(createPermissionConfigChecker("/api/v2/nvr/register")).toBe("NVR");
      expect(createPermissionConfigChecker("/api/v2/profiles")).toBe("profiles");
      expect(createPermissionConfigChecker("/api/v2/roles/create")).toBe("roles");
      expect(createPermissionConfigChecker("/api/v2/recipients/create")).toBe(
        "recipients"
      );
      expect(createPermissionConfigChecker("/api/v2/faceImages/quick-create-user")).toBe(
        "Users"
      );
    });
  });

  describe("editPermissionConfigChecker", () => {
    it("includes channels (channels have edit, not create at top-level)", () => {
      expect(editPermissionConfigChecker("/api/v1/channel/abc")).toBe("channels");
      expect(editPermissionConfigChecker("/api/v2/channel/abc")).toBe("channels");
    });

    it("maps channel detection toggles to detectionSettings permissions", () => {
      expect(editPermissionConfigChecker("/api/v1/channel/detection/toggle")).toBe(
        "detectionSettings"
      );
      expect(editPermissionConfigChecker("/api/v2/channel/detection/toggle")).toBe(
        "detectionSettings"
      );
    });

    it("does not include dashboard", () => {
      expect(editPermissionConfigChecker("/api/v1/dashboard")).toBe("");
      expect(editPermissionConfigChecker("/api/v2/dashboard")).toBe("");
    });

    it("maps v2 edit routes to their modules", () => {
      expect(editPermissionConfigChecker("/api/v2/locations/update")).toBe(
        "locations"
      );
      expect(editPermissionConfigChecker("/api/v2/permissions/update")).toBe(
        "permission"
      );
      expect(editPermissionConfigChecker("/api/v2/users/update")).toBe("Users");
      expect(editPermissionConfigChecker("/api/v2/authorizedUsers/update")).toBe(
        "Users"
      );
      expect(editPermissionConfigChecker("/api/v2/departments/update")).toBe(
        "departments"
      );
      expect(editPermissionConfigChecker("/api/v2/detection-settings/:id")).toBe(
        "detectionSettings"
      );
      expect(editPermissionConfigChecker("/api/v2/incidents/:id")).toBe(
        "incidents"
      );
      expect(editPermissionConfigChecker("/api/v2/nvr/:id")).toBe("NVR");
      expect(editPermissionConfigChecker("/api/v2/profiles/:id")).toBe(
        "profiles"
      );
      expect(editPermissionConfigChecker("/api/v2/roles/update")).toBe("roles");
      expect(editPermissionConfigChecker("/api/v2/recipients/update")).toBe(
        "recipients"
      );
      expect(editPermissionConfigChecker("/api/v2/faceImages/tag")).toBe("Users");
    });
  });

  describe("deletePermissionConfigChecker", () => {
    it("includes channels", () => {
      expect(deletePermissionConfigChecker("/api/v1/channel/abc")).toBe(
        "channels"
      );
      expect(deletePermissionConfigChecker("/api/v2/channel/abc")).toBe(
        "channels"
      );
    });

    it("handles /v1/user prefix as employee", () => {
      expect(deletePermissionConfigChecker("/v1/user")).toBe("employee");
    });

    it("maps v2 delete routes to their modules", () => {
      expect(deletePermissionConfigChecker("/api/v2/permissions/delete")).toBe(
        "permission"
      );
      expect(deletePermissionConfigChecker("/api/v2/locations/delete")).toBe(
        "locations"
      );
      expect(deletePermissionConfigChecker("/api/v2/users/delete")).toBe("Users");
      expect(deletePermissionConfigChecker("/api/v2/authorizedUsers/delete")).toBe(
        "Users"
      );
      expect(deletePermissionConfigChecker("/api/v2/departments/delete")).toBe(
        "departments"
      );
      expect(deletePermissionConfigChecker("/api/v2/detection-settings/:id")).toBe(
        "detectionSettings"
      );
      expect(deletePermissionConfigChecker("/api/v2/detection-objects/delete")).toBe(
        "detectionSettings"
      );
      expect(deletePermissionConfigChecker("/api/v2/incidents/:id")).toBe(
        "incidents"
      );
      expect(deletePermissionConfigChecker("/api/v2/nvr/:id")).toBe("NVR");
      expect(deletePermissionConfigChecker("/api/v2/profiles/:id")).toBe(
        "profiles"
      );
      expect(deletePermissionConfigChecker("/api/v2/roles/delete")).toBe("roles");
      expect(deletePermissionConfigChecker("/api/v2/recipients/delete")).toBe(
        "recipients"
      );
      expect(deletePermissionConfigChecker("/api/v2/faceImages/delete")).toBe(
        "Users"
      );
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

import axios from "axios";
import config from "config";
import logger from "./logger.js";
import authorizedUsersModel from "../core/v1/authorizedUsers/authorizedUsers.model.js";
import NVRModel from "../core/v1/NVR/nvr.model.js";
import locationModel from "../core/v1/locations/location.model.js";
import permissionModel from "../core/v1/permission/permissions.model.js";
import departmentsModel from "../core/v1/departments/departments.model.js";

export async function getEmpAuthInfo(email) {
  try {
    const response = await axios.post(
      `${config.get("empDomain")}/auth/info`,
      { email },
      { headers: { "Content-Type": "application/json" } }
    );
    return response.data || null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    logger.error("getEmpAuthInfo error:", error.message);
    throw error;
  }
}

export async function autoSyncLocations(adminData, userData) {
  try {
    if (adminData) {
      const adminObjId = adminData._id;
      const adminUserIdStr = userData?.user_id?.toString();

      // Normalize all existing departments for this admin to lowercase
      const departmentsList = await departmentsModel.find({ adminId: adminObjId }, { departmentName: 1 }).lean();
      if (departmentsList && departmentsList.length) {
        const bulkOpsDept = departmentsList.map(d => {
          if (!d.departmentName) return null;
          const newDeptName = typeof d.departmentName === 'string' ? d.departmentName.toLowerCase() : d.departmentName;
          
          if (newDeptName === d.departmentName) return null; // no change needed

          return {
            updateOne: {
              filter: { _id: d._id },
              update: { $set: { departmentName: newDeptName } }
            }
          };
        }).filter(op => op !== null);

        if (bulkOpsDept.length) {
          await departmentsModel.bulkWrite(bulkOpsDept);
        }
      }

      // Fetch location sources without rewriting their display casing.
      const authUsers = await authorizedUsersModel
        .find({ adminId: adminObjId }, { location: 1, locationId: 1 })
        .lean();

      const nvrs = await NVRModel
        .find({ userId: adminUserIdStr }, { location: 1 })
        .lean();

      const locationKey = (value) =>
        typeof value === "string" ? value.trim().toLowerCase() : "";
      const locationValues = (value) => Array.isArray(value) ? value : [value];
      const sourceLocations = new Map();
      const collectLocation = (value, empLocationId = null) => {
        const name = typeof value === "string" ? value.trim() : "";
        const key = locationKey(name);
        if (!key) return;

        const existing = sourceLocations.get(key);
        if (!existing) {
          sourceLocations.set(key, { name, empLocationId });
        } else if (!existing.empLocationId && empLocationId) {
          existing.empLocationId = empLocationId;
        }
      };

      // Collect from authorizedUsers
      (authUsers || []).forEach((u) => {
        locationValues(u.location).forEach((location) => {
          collectLocation(location, u.locationId || null);
        });
      });

      // Collect from NVRs
      (nvrs || []).forEach((n) => {
        locationValues(n.location).forEach((location) => {
          collectLocation(location);
        });
      });

      // Location documents are the source of truth for display casing.
      const existingLocationRecords = await locationModel
        .find({ adminId: adminObjId }, { locationName: 1 })
        .lean();
      const canonicalLocations = new Map();
      (existingLocationRecords || []).forEach((location) => {
        const key = locationKey(location.locationName);
        if (key && !canonicalLocations.has(key)) {
          canonicalLocations.set(key, location.locationName.trim());
        }
      });

      const newLocationsToCreate = [];
      for (const [key, source] of sourceLocations.entries()) {
        if (!canonicalLocations.has(key)) {
          canonicalLocations.set(key, source.name);
          newLocationsToCreate.push({
            locationName: source.name,
            empLocationId: source.empLocationId || "",
            adminId: adminObjId,
            isImportedFromEMP: true
          });
        }
      }

      if (newLocationsToCreate.length > 0) {
        await locationModel.insertMany(newLocationsToCreate);
        logger.info(`Auto-synced ${newLocationsToCreate.length} new locations for admin: ${adminObjId}`);
      }

      const canonicalize = (value) => {
        if (Array.isArray(value)) return value.map(canonicalize);
        if (typeof value !== "string") return value;
        return canonicalLocations.get(locationKey(value)) || value;
      };
      const locationChanged = (before, after) =>
        JSON.stringify(before) !== JSON.stringify(after);

      const authUserUpdates = (authUsers || []).map((user) => {
        const location = canonicalize(user.location);
        if (!user.location || !locationChanged(user.location, location)) return null;
        return {
          updateOne: {
            filter: { _id: user._id },
            update: { $set: { location } }
          }
        };
      }).filter(Boolean);
      if (authUserUpdates.length) {
        await authorizedUsersModel.bulkWrite(authUserUpdates);
      }

      const nvrUpdates = (nvrs || []).map((nvr) => {
        const location = canonicalize(nvr.location);
        if (!nvr.location || !locationChanged(nvr.location, location)) return null;
        return {
          updateOne: {
            filter: { _id: nvr._id },
            update: { $set: { location } }
          }
        };
      }).filter(Boolean);
      if (nvrUpdates.length) {
        await NVRModel.bulkWrite(nvrUpdates);
      }
    }
  } catch (syncError) {
    logger.error("Failed to auto-sync locations on login:", syncError);
    console.error("Failed to auto-sync locations:", syncError);
  }
}

export async function syncPermissionLocations(adminId) {
  try {
    if (!adminId) return;

    // Update admin permissions (full access)
    await permissionModel.updateMany(
      { adminId: adminId, permissionName: { $regex: /admin/i }, "permissionConfig.locations": { $exists: false } },
      { $set: { "permissionConfig.locations": { view: true, create: true, edit: true, delete: true } } }
    );

    // Update read permissions (view only)
    await permissionModel.updateMany(
      { adminId: adminId, permissionName: { $regex: /read/i }, "permissionConfig.locations": { $exists: false } },
      { $set: { "permissionConfig.locations": { view: true, create: false, edit: false, delete: false } } }
    );

    // Update write custom permissions (write roles or others excluding admin/read)
    // Write gets write by default but since people make weird custom roles, restrict it to be safe unless write regex.
    await permissionModel.updateMany(
      { adminId: adminId, permissionName: { $regex: /write/i }, "permissionConfig.locations": { $exists: false } },
      { $set: { "permissionConfig.locations": { view: true, create: true, edit: true, delete: false } } }
    );

    await permissionModel.updateMany(
      { adminId: adminId, permissionName: { $not: { $regex: /admin|read|write/i } }, "permissionConfig.locations": { $exists: false } },
      { $set: { "permissionConfig.locations": { view: true, create: true, edit: true, delete: true } } }
    );
    
    logger.info(`Synced locations permission config for admin: ${adminId}`);
  } catch (err) {
    logger.error("Error auto-syncing permission locations:", err);
  }
}

// Back-fills the stevinrock-specific log sub-permissions (conveyor, crusher,
// line-crossing, etc.) onto permission docs that predate them. Mirrors
// syncPermissionLocations: additive-only ($exists:false guards so a role's
// customised values are never overwritten), per-role-tier defaults, and fully
// try/caught so a failure here can never break login or stop the server.
// Called fire-and-forget on login; must stay self-contained.
export async function syncStevinrockLogPermissions(adminId) {
  try {
    if (!adminId) return;

    // Log sections introduced after the original permission seed. Each is
    // back-filled independently so partially-migrated docs still get the rest.
    const logKeys = [
      "conveyorLogs",
      "vehicleObstructionLogs",
      "vehicleCountLogs",
      "crusherLogs",
      "lineCrossingLogs",
      "waterSpillLogs",
      "unauthorizedAccessLogs",
    ];

    // Per-tier value + the role-name matcher, matching syncPermissionLocations'
    // admin / read / write / custom split. Custom (non admin/read/write) roles
    // get denied by default — a newly-introduced permission must never grant
    // itself access on a role it wasn't explicitly configured for; an admin
    // opts custom roles in later via Roles & Permission.
    const tiers = [
      { match: { $regex: /admin/i }, value: { view: true, create: true, edit: true, delete: true } },
      { match: { $regex: /read/i }, value: { view: true, create: false, edit: false, delete: false } },
      { match: { $regex: /write/i }, value: { view: true, create: true, edit: true, delete: false } },
      { match: { $not: { $regex: /admin|read|write/i } }, value: { view: false, create: false, edit: false, delete: false } },
    ];

    for (const tier of tiers) {
      for (const key of logKeys) {
        const path = `permissionConfig.logs.${key}`;
        await permissionModel.updateMany(
          {
            adminId: adminId,
            permissionName: tier.match,
            [path]: { $exists: false },
          },
          { $set: { [path]: tier.value } }
        );
      }
    }

    logger.info(`Synced stevinrock log permission config for admin: ${adminId}`);
  } catch (err) {
    logger.error("Error auto-syncing stevinrock log permissions:", err);
  }
}

// Back-fills the alerts/analytics top-level modules onto permission docs that
// predate them. Same additive-only shape as syncPermissionLocations — one
// $exists:false-guarded updateMany per role tier per key, so a role's own
// customised values (or an already-migrated doc) are never overwritten.
export async function syncAlertsAnalyticsPermissions(adminId) {
  try {
    if (!adminId) return;

    const moduleKeys = ["alerts", "analytics"];

    const tiers = [
      { match: { $regex: /admin/i }, value: { view: true, create: true, edit: true, delete: true } },
      { match: { $regex: /read/i }, value: { view: true, create: false, edit: false, delete: false } },
      { match: { $regex: /write/i }, value: { view: true, create: true, edit: true, delete: false } },
      { match: { $not: { $regex: /admin|read|write/i } }, value: { view: false, create: false, edit: false, delete: false } },
    ];

    for (const tier of tiers) {
      for (const key of moduleKeys) {
        const path = `permissionConfig.${key}`;
        await permissionModel.updateMany(
          {
            adminId: adminId,
            permissionName: tier.match,
            [path]: { $exists: false },
          },
          { $set: { [path]: tier.value } }
        );
      }
    }

    logger.info(`Synced alerts/analytics permission config for admin: ${adminId}`);
  } catch (err) {
    logger.error("Error auto-syncing alerts/analytics permissions:", err);
  }
}

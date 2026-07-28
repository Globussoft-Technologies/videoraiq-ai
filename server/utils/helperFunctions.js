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

      // Fetch from authorizedUsers
      const authUsers = await authorizedUsersModel
        .find({ adminId: adminObjId }, { location: 1, locationId: 1 })
        .lean();

      // Normalize authorizedUsers locations to lowercase
      if (authUsers && authUsers.length) {
        const bulkOps = authUsers.map(u => {
          if (!u.location) return null;
          const newLoc = Array.isArray(u.location)
            ? u.location.map(l => typeof l === 'string' ? l.toLowerCase() : l)
            : typeof u.location === 'string'
              ? u.location.toLowerCase()
              : u.location;
          return {
            updateOne: {
              filter: { _id: u._id },
              update: { $set: { location: newLoc } }
            }
          };
        }).filter(op => op !== null);
        if (bulkOps.length) {
          await authorizedUsersModel.bulkWrite(bulkOps);
        }
      }

      // Fetch from NVR
      const nvrs = await NVRModel
        .find({ userId: adminUserIdStr }, { location: 1 })
        .lean();

      // Normalize NVR locations to lowercase
      if (nvrs && nvrs.length) {
        const bulkOpsNVR = nvrs.map(n => {
          if (!n.location) return null;
          const newLoc = Array.isArray(n.location)
            ? n.location.map(l => typeof l === 'string' ? l.toLowerCase() : l)
            : typeof n.location === 'string'
              ? n.location.toLowerCase()
              : n.location;
          return {
            updateOne: {
              filter: { _id: n._id },
              update: { $set: { location: newLoc } }
            }
          };
        }).filter(op => op !== null);
        if (bulkOpsNVR.length) {
          await NVRModel.bulkWrite(bulkOpsNVR);
        }
      }

      // Map to track unique locationName -> locationId
      const uniqueLocationsMap = new Map();

      // Collect from authorizedUsers
      authUsers.forEach((u) => {
        if (u.location) {
          const locs = Array.isArray(u.location) ? u.location : [u.location];
          locs.forEach((loc) => {
            if (loc) {
              const existingEmpId = uniqueLocationsMap.get(loc);
              uniqueLocationsMap.set(loc, existingEmpId || (u.locationId || null));
            }
          });
        }
      });

      // Collect from NVRs
      nvrs.forEach((n) => {
        if (n.location) {
          const locs = Array.isArray(n.location) ? n.location : [n.location];
          locs.forEach((loc) => {
            if (loc && !uniqueLocationsMap.has(loc)) {
              uniqueLocationsMap.set(loc, null);
            }
          });
        }
      });

    // Check against Location collection and create missing (case-insensitive)
    const existingLocationRecords = await locationModel
      .find({ adminId: adminObjId }, { locationName: 1 })
      .lean();

    // Use lowercased names for comparison
    const existingLocationNamesLower = new Set(existingLocationRecords.map(l => l.locationName?.toLowerCase?.() || ""));

    const newLocationsToCreate = [];
    for (const [locName, empLocId] of uniqueLocationsMap.entries()) {
      if (locName && !existingLocationNamesLower.has(locName.toLowerCase())) {
        newLocationsToCreate.push({
          locationName: locName,
          empLocationId: empLocId || "",
          adminId: adminObjId,
          isImportedFromEMP:true
        });
      }
    }

    if (newLocationsToCreate.length > 0) {
      await locationModel.insertMany(newLocationsToCreate);
      logger.info(`Auto-synced ${newLocationsToCreate.length} new locations for admin: ${adminObjId}`);
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

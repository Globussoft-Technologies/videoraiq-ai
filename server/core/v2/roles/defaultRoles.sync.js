/**
 * Reconciling the three default roles (admin / read / write) against the
 * canonical templates in permissions.config.js.
 *
 * WHY THIS IS NEEDED AT ALL
 * The templates are not a live reference — they are a STAMP. Auth.service
 * copies one into a permission document when it first provisions a tenant, and
 * from that moment the role reads its own copy. Editing the template changes
 * what future tenants receive and nothing else, so a module added later
 * (logs.carLogs) reaches new tenants automatically and never reaches existing
 * ones. Default roles are also locked in the UI and refused by
 * PermissionService.updatePermissions, so they cannot be repaired by hand.
 *
 * Shared by two callers so they can never drift:
 *   - Auth.service, on login — makes the repair automatic.
 *   - POST /roles/sync-defaults — the manual button, and the dry-run preview.
 *
 * Lives in its own module rather than roles.service.js purely to keep
 * auth.service.js from importing the whole roles service (and the import cycle
 * that would invite).
 */
import mongoose from "mongoose";
import rolesModel from "./roles.model.js";
import permissionModel from "../permission/permissions.model.js";
import { DEFAULT_ROLE_PRESETS, cloneConfig } from "../permission/permissions.config.js";

/**
 * Which permissionConfig entries differ between the stored doc and the
 * canonical template, reported as dotted paths ("logs.carLogs", "playbacks").
 *
 * `added` = the module is absent from the stored doc entirely — the case this
 * whole thing exists for: a module shipped after the tenant was seeded.
 * `changed` = present but with different flags, e.g. someone cascaded the flat
 * role toggles over a default role through PUT /roles/update, which does not
 * block is_default the way the granular permission update does.
 */
export const diffPermissionConfig = (stored = {}, template = {}) => {
    const added = [];
    const changed = [];

    const walk = (storedNode, templateNode, path) => {
        for (const key of Object.keys(templateNode || {})) {
            const templateValue = templateNode[key];
            const storedValue = storedNode?.[key];
            const dotted = path ? `${path}.${key}` : key;

            // A permission leaf is {view,create,edit,delete}; anything else with
            // object values (only `logs` today) is a group to recurse into.
            const isLeaf = templateValue && typeof templateValue === "object"
                && !Object.values(templateValue).some((entry) => entry && typeof entry === "object");

            if (!isLeaf) {
                walk(storedValue, templateValue, dotted);
                continue;
            }

            if (storedValue == null || typeof storedValue !== "object") {
                added.push(dotted);
                continue;
            }
            const differs = Object.keys(templateValue)
                .some((flag) => Boolean(storedValue[flag]) !== Boolean(templateValue[flag]));
            if (differs) changed.push(dotted);
        }
    };

    walk(stored, template, "");
    return { added, changed };
};

/**
 * Bring one admin's default roles back in line with the templates.
 *
 * The template is applied WHOLESALE rather than merged: a default role is meant
 * to BE the canonical matrix, so anything that drifted from it is drift to
 * correct. Custom (is_default:false) roles are never looked at.
 *
 * @param {object}  options
 * @param {string}  options.adminId  tenant to reconcile
 * @param {string}  [options.userId] stamped into createdBy/updatedBy
 * @param {boolean} [options.dryRun] compute the diff, write nothing
 * @returns {Promise<{rolesTouched:number, modules:number, roles:Array}>}
 */
export const reconcileDefaultRoles = async ({ adminId, userId = null, dryRun = false }) => {
    const roles = [];

    for (const preset of DEFAULT_ROLE_PRESETS) {
        // Deep copy: the templates are module-level `let` exports shared by
        // every request, so handing one straight to mongoose would let one
        // tenant's document alias another's.
        const config = cloneConfig(preset.config);
        const existingRole = await rolesModel.findOne({ adminId, roleName: preset.roleName });

        if (!existingRole) {
            // The role is missing outright (a tenant provisioned before this
            // preset existed). Seed it the same way Auth.service would.
            if (!dryRun) {
                const permission = await permissionModel.create({
                    adminId,
                    permissionConfig: config,
                    permissionName: `${preset.roleName}Permission`,
                    is_default: true,
                    createdBy: { userId },
                });
                await rolesModel.create({
                    adminId,
                    roleName: preset.roleName,
                    isEmpRole: preset.isEmpRole,
                    ...preset.flags,
                    is_default: true,
                    permissionId: permission?._id,
                    createdBy: { userId },
                });
            }
            roles.push({
                roleName: preset.roleName,
                roleCreated: true,
                permissionCreated: true,
                added: Object.keys(config),
                changed: [],
                flagsUpdated: true,
            });
            continue;
        }

        let permission = existingRole.permissionId
            ? await permissionModel.findOne({ _id: existingRole.permissionId })
            : null;

        // A default role with a dangling permissionId cannot be repaired through
        // any other route, so rebuild the document and relink it.
        const permissionCreated = !permission;
        const storedConfig = permission?.permissionConfig ?? {};
        const { added, changed } = diffPermissionConfig(storedConfig, config);

        const flags = preset.flags;
        const flagsUpdated = Object.keys(flags)
            .some((flag) => Boolean(existingRole[flag]) !== Boolean(flags[flag]));

        if (!dryRun) {
            if (permissionCreated) {
                permission = await permissionModel.create({
                    adminId,
                    permissionConfig: config,
                    permissionName: `${preset.roleName}Permission`,
                    is_default: true,
                    createdBy: { userId },
                });
            } else if (added.length || changed.length || !permission.is_default) {
                permission.permissionConfig = config;
                permission.is_default = true;
                // permissionConfig is a schemaless Object — mongoose does not
                // see the reassignment without this.
                permission.markModified("permissionConfig");
                await permission.save();
            }

            if (flagsUpdated || permissionCreated || !existingRole.is_default) {
                await rolesModel.updateOne(
                    { _id: existingRole._id },
                    {
                        $set: {
                            ...flags,
                            is_default: true,
                            permissionId: permission._id,
                            updatedBy: { userId },
                        },
                    },
                );
            }
        }

        roles.push({
            roleName: preset.roleName,
            roleCreated: false,
            permissionCreated,
            added,
            changed,
            flagsUpdated,
        });
    }

    const modules = roles.reduce(
        (total, role) => total + role.added.length + role.changed.length,
        0,
    );
    const rolesTouched = roles.filter(
        (role) => role.roleCreated || role.permissionCreated || role.flagsUpdated
            || role.added.length || role.changed.length,
    ).length;

    return { rolesTouched, modules, roles };
};

/**
 * Login-time entry point. Same reconcile, but it must never be able to break a
 * login: any failure is swallowed and reported, because a stale permission
 * matrix is a far smaller problem than a tenant that cannot sign in.
 *
 * In the steady state this costs three findOne calls and no writes — the diff
 * comes back empty and nothing is saved.
 */
export const reconcileDefaultRolesOnLogin = async ({ adminId, userId = null, logger }) => {
    try {
        if (!adminId) return null;
        const result = await reconcileDefaultRoles({
            adminId: new mongoose.Types.ObjectId(String(adminId)),
            userId,
        });
        if (result.rolesTouched) {
            logger?.info(
                `[ROLES] default roles auto-synced on login admin=${adminId} ` +
                `roles=${result.rolesTouched} modules=${result.modules}`,
            );
        }
        return result;
    } catch (err) {
        logger?.error(`[ROLES] default role auto-sync skipped for admin=${adminId}: ${err.message}`);
        return null;
    }
};

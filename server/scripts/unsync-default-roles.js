/**
 * Test helper — puts the three default roles BACK into the stale, pre-sync
 * state so POST /roles/sync-defaults ("Sync Default Roles" in the UI) has
 * something real to repair.
 *
 * This is the inverse of the sync: it strips chosen modules out of the
 * admin/read/write permission documents, reproducing exactly what a tenant
 * provisioned before those modules shipped looks like.
 *
 * SAFETY
 *  - Dry run by default. Nothing is written unless you pass --apply.
 *  - Only ever touches roles with is_default:true. Custom roles are untouched.
 *  - Only removes the modules you name; everything else in the config is left
 *    exactly as it is.
 *
 * USAGE
 *   node scripts/unsync-default-roles.js --admin=<adminId>
 *       Preview: show what would be stripped. Writes nothing.
 *
 *   node scripts/unsync-default-roles.js --admin=<adminId> --apply
 *       Actually strip. Defaults to removing logs.carLogs.
 *
 *   node scripts/unsync-default-roles.js --admin=<adminId> --modules=logs.carLogs,playbacks --apply
 *       Strip specific dotted module paths.
 *
 *   node scripts/unsync-default-roles.js --list
 *       Show the admins that have default roles, so you can pick an id.
 *
 * --admin is REQUIRED for any write: this connects to whatever DB the current
 * NODE_ENV config points at, which is a shared server, so a run must always
 * name the single tenant it is allowed to alter.
 */
import mongoose from "mongoose";
import config from "config";
import rolesModel from "../core/v2/roles/roles.model.js";
import permissionModel from "../core/v2/permission/permissions.model.js";

const DEFAULT_ROLE_NAMES = ["admin", "read", "write"];
const DEFAULT_MODULES = ["logs.carLogs"];

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const flag = (name) => process.argv.includes(`--${name}`);

/** Remove a dotted path ("logs.carLogs" / "playbacks") from a config object. */
const stripPath = (configObject, dotted) => {
  const parts = dotted.split(".");
  const leaf = parts.pop();
  let node = configObject;
  for (const part of parts) {
    if (!node || typeof node !== "object") return false;
    node = node[part];
  }
  if (!node || typeof node !== "object" || !(leaf in node)) return false;
  delete node[leaf];
  return true;
};

async function main() {
  // utils/database.js reads this same key — stay in step with the app.
  const uri = config.get("mongodb_uri");
  const apply = flag("apply");
  const adminId = arg("admin");
  const modules = (arg("modules") || DEFAULT_MODULES.join(",")).split(",").map((m) => m.trim()).filter(Boolean);

  await mongoose.connect(uri);
  // Host only — never print the credentials embedded in the URI.
  console.log(`Connected to ${uri.replace(/\/\/[^@]*@/, "//<redacted>@")}`);
  console.log(`Mode: ${apply ? "APPLY (will write)" : "DRY RUN (no writes)"}`);

  if (flag("list")) {
    const rows = await rolesModel.aggregate([
      { $match: { is_default: true, roleName: { $in: DEFAULT_ROLE_NAMES } } },
      { $group: { _id: "$adminId", roles: { $push: "$roleName" } } },
    ]);
    console.log(`\n${rows.length} admin(s) with default roles:`);
    rows.forEach((row) => console.log(`  ${row._id}  [${row.roles.sort().join(", ")}]`));
    await mongoose.connection.close();
    return;
  }

  if (!adminId) {
    console.error("\n✖ --admin=<adminId> is required. Run with --list to find one.");
    await mongoose.connection.close();
    process.exitCode = 1;
    return;
  }

  const roles = await rolesModel.find({
    adminId: new mongoose.Types.ObjectId(adminId),
    is_default: true,
    roleName: { $in: DEFAULT_ROLE_NAMES },
  });

  if (!roles.length) {
    console.error(`\n✖ No default roles found for admin ${adminId}.`);
    await mongoose.connection.close();
    process.exitCode = 1;
    return;
  }

  console.log(`\nAdmin ${adminId} — stripping [${modules.join(", ")}] from ${roles.length} default role(s):\n`);

  let written = 0;
  for (const role of roles) {
    const permission = await permissionModel.findOne({ _id: role.permissionId });
    if (!permission) {
      console.log(`  ${role.roleName.padEnd(6)} — no permission document linked, skipped`);
      continue;
    }

    const permissionConfig = JSON.parse(JSON.stringify(permission.permissionConfig || {}));
    const removed = modules.filter((module) => stripPath(permissionConfig, module));

    if (!removed.length) {
      console.log(`  ${role.roleName.padEnd(6)} — already absent, nothing to strip`);
      continue;
    }

    if (apply) {
      permission.permissionConfig = permissionConfig;
      permission.markModified("permissionConfig");
      await permission.save();
      written += 1;
    }
    console.log(`  ${role.roleName.padEnd(6)} — ${apply ? "removed" : "would remove"} ${removed.join(", ")}`);
  }

  console.log(
    apply
      ? `\n✅ Updated ${written} permission document(s). Open Roles & Permission and hit "Sync Default Roles".`
      : `\nDry run only — nothing was written. Re-run with --apply to make the change.`,
  );

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error("✖ Failed:", err.message);
  await mongoose.connection.close().catch(() => {});
  process.exitCode = 1;
});

/**
 * One-time backfill: give every existing login user (Users page) its linked
 * email alert recipient, the same way saving the user does from now on
 * (core/v1/verifyRecipients/userRecipients.js).
 *
 *   node scripts/link-user-recipients.js                    # dry run, all admins
 *   node scripts/link-user-recipients.js --admin harish     # dry run, one admin
 *   node scripts/link-user-recipients.js --execute          # apply
 *
 * --admin matches the admin's email, login or first name (case-insensitive).
 * Per user: an existing recipient with the same address (any letter case) is
 * adopted, keeping its alert types and detections; otherwise a new one is
 * created with no alert types, so nobody starts getting alerts. Rows created
 * here are unverified unless they adopt a verified row: these addresses were
 * never verified from the Add User form.
 * Also lists recipient addresses that appear more than once for an admin in
 * different letter case. Those already alert twice; merge them by hand.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { decryptConfig } from "./decrypt.js";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const adminArg = args.includes("--admin") ? args[args.indexOf("--admin") + 1] : null;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function loadConfig() {
  if (process.env.NODE_CONFIG || !process.env.MK) return;
  const file = path.join(serverRoot, "config", `${process.env.NODE_ENV || "development"}.json.enc`);
  try {
    process.env.NODE_CONFIG = JSON.stringify(decryptConfig(process.env.MK, file));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function main() {
  if (adminArg !== null && (!adminArg || adminArg.startsWith("--"))) {
    throw new Error("Pass --admin <email | login | first name>");
  }
  loadConfig();
  const config = (await import("config")).default;
  await mongoose.connect(config.get("mongodb_uri"));

  const { default: Admin } = await import("../core/v1/admin/admin.model.js");
  const { default: Users } = await import("../core/v1/users/users.model.js");
  const { default: Recipient } = await import("../core/v1/verifyRecipients/recipients.model.js");
  const { syncUserRecipient } = await import("../core/v1/verifyRecipients/userRecipients.js");

  let adminFilter = {};
  if (adminArg) {
    const rx = new RegExp(escapeRegex(adminArg), "i");
    const admins = await Admin.find({ $or: [{ email: rx }, { login: rx }, { firstName: rx }] }).select("_id email").lean();
    if (admins.length !== 1) {
      throw new Error(`--admin "${adminArg}" matched ${admins.length} admins: ${admins.map((a) => a.email).join(", ") || "none"}`);
    }
    adminFilter = { adminId: admins[0]._id };
    console.log(`Admin: ${admins[0].email}`);
  }

  const users = await Users.find({ ...adminFilter, email: { $nin: [null, ""] } })
    .select("_id adminId email firstName lastName userName")
    .lean();

  const counts = { linked: 0, adopt: 0, create: 0 };
  for (const user of users) {
    const email = String(user.email).trim().toLowerCase();
    const linked = await Recipient.exists({ adminId: user.adminId, userId: user._id });
    const unlinked = linked
      ? null
      : await Recipient.exists({
        adminId: user.adminId,
        type: "email",
        userId: null,
        value: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
      });
    const action = linked ? "linked" : unlinked ? "adopt" : "create";
    counts[action] += 1;
    if (action !== "linked") console.log(`${action.padEnd(6)} ${email}`);
  }
  console.log(`\nUsers with an email: ${users.length}`);
  console.log(`  already linked: ${counts.linked}  adopt existing row: ${counts.adopt}  create new row: ${counts.create}`);

  const duplicates = await Recipient.aggregate([
    { $match: { ...adminFilter, type: "email" } },
    { $group: { _id: { adminId: "$adminId", value: { $toLower: "$value" } }, values: { $push: "$value" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  if (duplicates.length) {
    console.log(`\nAddresses with more than one recipient row (merge by hand):`);
    for (const d of duplicates) console.log(`  admin ${d._id.adminId}: ${d.values.join(" | ")}`);
  }

  if (!execute) {
    console.log("\nDry run. Re-run with --execute to apply.");
    return;
  }
  await Recipient.createIndexes(); // the one-recipient-per-user index
  let done = 0;
  for (const user of users) {
    if (await syncUserRecipient(user)) done += 1;
  }
  console.log(`\nSynced ${done} of ${users.length} users. Failures, if any, are in the server log as [RECIPIENT_SYNC].`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

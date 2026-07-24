/**
 * One-time migration: rename authorizedUsers.profilePics files whose stored
 * path contains URL-unsafe characters (spaces, parens, #, &, %, +, unicode) to
 * a sanitized, URL-safe path on NAS/SFTP, and update the DB paths to match.
 *
 * Fixes fetch/download of images saved with names like "image (1).jpg".
 * The sanitize rule matches the upload-time sanitizer in
 * authorizedUsers.service.js (uploadFilesToSFTP).
 *
 * SAFE BY DEFAULT: dry run unless --apply is passed.
 * IDEMPOTENT: already-clean paths are skipped; a re-run after a partial run
 * resumes (fixes the DB pointer when the file was already moved).
 *
 * Run inside the container (WORKDIR /app), MK + NODE_ENV already in the env:
 *   node scripts/migrate-sanitize-profilePics.js            # preview (dry run)
 *   node scripts/migrate-sanitize-profilePics.js --apply    # execute
 */
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";
import { decryptConfig } from "./decrypt.js";

// First line of output. If you see NOTHING below this, the script body isn't
// running: wrong path / not baked into the image, or a debugger pause from an
// inherited NODE_OPTIONS=--inspect. Clear it: docker exec -e NODE_OPTIONS= ...
console.log(`▶ migrate-sanitize-profilePics.js | NODE_ENV=${process.env.NODE_ENV ?? "(unset)"} | cwd=${process.cwd()} | args=${process.argv.slice(2).join(" ") || "(none)"}`);

// Decrypt + inject config BEFORE importing anything that reads it (mirrors
// bootstrap.js). No-op in a dev env that already has NODE_CONFIG or plain files.
if (!process.env.NODE_CONFIG) {
  const encPath = path.join(process.cwd(), "config", `${process.env.NODE_ENV}.json.enc`);
  if (fs.existsSync(encPath)) {
    if (!process.env.MK) {
      console.error("❌ MK env var is required to decrypt config.");
      process.exit(1);
    }
    process.env.NODE_CONFIG = JSON.stringify(decryptConfig(process.env.MK, encPath));
    console.log("🔓 Config decrypted and injected");
  } else {
    console.warn(`⚠ No encrypted config at ${encPath} and NODE_CONFIG is unset — config.get() will fail. Check NODE_ENV/MK, or run inside the app container.`);
  }
} else {
  console.log("ℹ NODE_CONFIG already present in env — using it");
}

const DRY_RUN = !process.argv.includes("--apply");

// process.exit() can truncate buffered stdout on a pipe (non-TTY). Flush first.
const flushAndExit = (code) =>
  new Promise(() => process.stdout.write("", () => process.exit(code)));

// Same rule as the upload-time sanitizer, applied per path segment (keeps "/").
const UNSAFE = /[^A-Za-z0-9\/._-]/;                    // any char outside the safe set
const sanitizeSegment = (seg) => seg.replace(/[^\w.-]+/g, "_");
const sanitizePath = (p) => p.split("/").map(sanitizeSegment).join("/");
const isOracle = (p) => p.replace(/^\/+/, "").startsWith("oracle/");
const isAbsoluteUrl = (p) => /^https?:\/\//i.test(p);

async function main() {
  // Dynamic imports so the config injection above runs first.
  const { default: config } = await import("config");
  const { default: mongoose } = await import("mongoose");
  const { default: AuthorizedUsers } = await import("../core/v1/authorizedUsers/authorizedUsers.model.js");
  const { withSFTPConnection, disconnectSFTP } = await import("../utils/newSFTPConnectionCheck.js");

  const MONGO_URI = config.get("mongodb_uri");
  let usersChanged = 0, filesRenamed = 0, skipped = 0;

  console.log(`🔄 Sanitize profilePics filenames — ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE (--apply)"}`);

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const users = await AuthorizedUsers.find({
      profilePics: { $elemMatch: { $regex: "[^A-Za-z0-9/._-]" } },
    }).select("_id firstName lastName profilePics");

    console.log(`📊 ${users.length} user(s) have at least one unsafe profilePics path\n`);

    if (users.length) {
      await withSFTPConnection(async (sftp) => {
        for (const user of users) {
          const before = Array.isArray(user.profilePics) ? user.profilePics : [];
          const after = [...before];
          let touched = false;

          for (let i = 0; i < before.length; i++) {
            const oldPath = before[i];
            if (typeof oldPath !== "string" || !UNSAFE.test(oldPath)) continue; // already safe

            if (isAbsoluteUrl(oldPath)) {
              console.log(`   ⚠ skip (absolute URL — run migrate-profilePics-to-relative first): ${oldPath}`);
              skipped++; continue;
            }
            if (isOracle(oldPath)) {
              console.log(`   ⚠ skip (Oracle path — rename unsupported here): ${oldPath}`);
              skipped++; continue;
            }

            const newPath = sanitizePath(oldPath);
            if (newPath === oldPath) continue;

            console.log(`   👤 ${user.firstName} ${user.lastName} (${user._id})`);
            console.log(`   ${DRY_RUN ? "would rename" : "renaming"}:\n     - ${oldPath}\n     + ${newPath}`);

            if (!DRY_RUN) {
              try {
                const oldExists = await sftp.exists(oldPath);
                const newExists = await sftp.exists(newPath);

                if (oldExists && newExists) {
                  console.log(`   ⚠ skip (target already exists): ${newPath}`);
                  skipped++; continue;
                }
                if (oldExists) {
                  await sftp.mkdir(path.posix.dirname(newPath), true).catch(() => {});
                  await sftp.rename(oldPath, newPath);
                  filesRenamed++;
                } else if (newExists) {
                  console.log(`   ↺ file already at target; updating DB pointer only`);
                } else {
                  console.log(`   ⚠ skip (source not found on storage): ${oldPath}`);
                  skipped++; continue; // leave DB pointing at the old value
                }
              } catch (err) {
                console.log(`   ❌ rename failed (${err.message}); leaving DB unchanged for this file`);
                skipped++; continue;
              }
            }

            after[i] = newPath;
            touched = true;
          }

          if (touched) {
            if (!DRY_RUN) await AuthorizedUsers.updateOne({ _id: user._id }, { profilePics: after });
            usersChanged++;
          }
        }
      });
      await disconnectSFTP().catch(() => {});
    }

    console.log(`\n${DRY_RUN ? "📝 Preview" : "✅ Done"}: ${usersChanged} user(s) ${DRY_RUN ? "would change" : "updated"}, ${filesRenamed} file(s) renamed, ${skipped} skipped.`);
    if (DRY_RUN) console.log("Re-run with --apply to perform the changes.");
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
  await flushAndExit(0);
}

main().catch(async (err) => {
  console.error("❌ Migration failed:", err);
  await flushAndExit(1);
});

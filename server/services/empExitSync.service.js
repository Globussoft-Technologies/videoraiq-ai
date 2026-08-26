/**
 * Employee exit sync.
 *
 * Every intervalHours (default 1h), pulls each admin's employees from
 * EmpMonitor (the same `user/fieldAllEmployeeListMultiOrg` endpoint
 * UsersService.allOrgEmployee calls) and suspends any VideoRDB
 * (authorizedUsers) account whose EmpMonitor record now carries a
 * `date_of_exit`. This is what turns off camera/site access automatically
 * when someone leaves the organization instead of relying on an admin to
 * remember to deactivate them by hand.
 *
 * Config (config/<env>.json):
 *   "EmpExitSync": {
 *     "enabled": true,       // defaults to true — set false to kill-switch
 *     "intervalHours": 1
 *   }
 *
 * Match rule per employee: only a VideoRDB user with status "active" AND a
 * non-empty EmpMonitor date_of_exit gets flipped to "suspended". Already-
 * suspended users and employees with no exit date are left untouched, and the
 * update itself is filtered on status:"active" so a repeat run against the
 * same exited employee matches zero documents (no-op, no log noise).
 *
 * Safety properties (mirrors services/retention.service.js — this runs
 * inside the API process, which exits on any unhandled rejection):
 * - fully try/caught at every level; one admin's or one page's failure never
 *   stops the sweep for the rest
 * - an in-process lock prevents overlapping runs
 * - a per-admin page cap bounds a single run even if EmpMonitor's `count`
 *   is wrong or an org has an unexpectedly huge roster — anything left over
 *   is picked up on the next hourly tick (idempotent by design)
 */
import axios from "axios";
import config from "config";
import logger from "../utils/logger.js";
import adminModel from "../core/v1/admin/admin.model.js";
import authorizedUsersModel from "../core/v1/authorizedUsers/authorizedUsers.model.js";

const PAGE_LIMIT = 200;
const MAX_PAGES_PER_ADMIN = 500; // backstop against a bad/huge `count`

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Flatten an axios error down to the parts that actually explain a failure. */
function describeAxiosError(err) {
  if (err?.response) {
    // EmpMonitor answered, just not with 2xx — the response body usually says why.
    const body = typeof err.response.data === "string"
      ? err.response.data.slice(0, 500)
      : JSON.stringify(err.response.data)?.slice(0, 500);
    return `HTTP ${err.response.status} ${err.response.statusText || ""} — ${body}`;
  }
  if (err?.request) {
    // Request went out, no response came back — DNS, timeout, wrong domain, network egress, etc.
    return `no response received (${err.code || err.message})`;
  }
  return err?.message || String(err);
}

/** One page of an admin's EmpMonitor roster. */
async function fetchEmployeePage(organization_ids, skip, limit) {
  const url = config.get("empDomain") + "user/fieldAllEmployeeListMultiOrg";
  logger.info(
    `[EMP-EXIT-SYNC] POST ${url} organization_ids=[${organization_ids.join(",")}] skip=${skip} limit=${limit}`,
  );
  const response = await axios.post(url, {
    secretKey: config.get("emp_secret_key"),
    organization_ids,
    skip,
    limit,
  });
  const data = response?.data?.data;
  const users = Array.isArray(data?.users) ? data.users : [];
  const count = Number(data?.count) || 0;
  logger.info(
    `[EMP-EXIT-SYNC] EmpMonitor responded: ${users.length} users on this page, reported count=${count}` +
      (users.length === 0 ? ` (raw response: ${JSON.stringify(response?.data)?.slice(0, 300)})` : ""),
  );
  return { users, count };
}

/** Suspend one exited employee's VideoRDB account, if still active. Never throws. */
async function suspendIfActive(adminId, employee, summary) {
  const email = employee?.email;
  if (!email) {
    logger.warn(`[EMP-EXIT-SYNC] admin ${adminId}: EmpMonitor employee has no email — skipping (id=${employee?.id})`);
    return;
  }
  if (!employee?.date_of_exit) return; // no exit date -> nothing to do

  logger.info(
    `[EMP-EXIT-SYNC] admin ${adminId}: ${email} has date_of_exit=${employee.date_of_exit} — checking VideoRDB`,
  );
  try {
    const result = await authorizedUsersModel.updateOne(
      {
        adminId,
        email: new RegExp(`^${escapeRegex(email)}$`, "i"),
        status: "active",
      },
      { $set: { status: "suspended" } },
    );
    if (result.matchedCount) {
      summary.matched += 1;
      if (result.modifiedCount) {
        summary.suspended += 1;
        logger.info(`[EMP-EXIT-SYNC] admin ${adminId}: suspended ${email}`);
      }
    } else {
      // Either no VideoRDB account for this email, or it's already suspended —
      // both are expected no-ops, but worth seeing while chasing "nothing happened".
      logger.info(
        `[EMP-EXIT-SYNC] admin ${adminId}: no active VideoRDB user matched ${email} (already suspended, or never imported)`,
      );
    }
  } catch (err) {
    logger.error(
      `[EMP-EXIT-SYNC] admin ${adminId}: failed to suspend ${email}: ${err?.message}`,
    );
  }
}

/** Sync one admin's exited employees across every EmpMonitor page. Never throws. */
async function syncAdmin(admin) {
  const summary = { processed: 0, matched: 0, suspended: 0 };

  const organization_ids = [
    ...new Set(
      (admin.empData || [])
        .filter((entry) => entry?.orgId)
        .map((entry) => Number(entry.orgId)),
    ),
  ];
  if (!organization_ids.length) {
    logger.warn(
      `[EMP-EXIT-SYNC] admin ${admin._id}: has empData but no usable orgId — skipping ` +
        `(empData=${JSON.stringify(admin.empData)?.slice(0, 300)})`,
    );
    return summary;
  }

  logger.info(`[EMP-EXIT-SYNC] admin ${admin._id}: syncing orgIds=[${organization_ids.join(",")}]`);

  let skip = 0;
  for (let page = 0; page < MAX_PAGES_PER_ADMIN; page += 1) {
    let batch;
    try {
      batch = await fetchEmployeePage(organization_ids, skip, PAGE_LIMIT);
    } catch (err) {
      logger.error(
        `[EMP-EXIT-SYNC] admin ${admin._id}: EmpMonitor fetch failed at skip=${skip}: ${describeAxiosError(err)}`,
      );
      break; // rest of this admin's pages are retried on the next hourly tick
    }

    for (const employee of batch.users) {
      summary.processed += 1;
      await suspendIfActive(admin._id, employee, summary);
    }

    skip += PAGE_LIMIT;
    // EmpMonitor's `count` has been wrong before. A full page means there may
    // still be more rows, so keep asking until the API returns a short/empty
    // page; MAX_PAGES_PER_ADMIN remains the hard safety cap.
    if (batch.users.length < PAGE_LIMIT) break;
  }

  logger.info(
    `[EMP-EXIT-SYNC] admin ${admin._id}: done — ${summary.processed} processed, ` +
      `${summary.matched} matched, ${summary.suspended} suspended`,
  );
  return summary;
}

let running = false; // in-process lock — one API instance runs the sync

/** One full sync pass across every admin with an EmpMonitor org linked. Never throws. */
export async function runEmpExitSync() {
  if (running) {
    logger.warn("[EMP-EXIT-SYNC] sync already running — skipping this tick");
    return null;
  }
  running = true;
  logger.info("[EMP-EXIT-SYNC] sync starting");
  const totals = { admins: 0, processed: 0, matched: 0, suspended: 0 };
  try {
    const admins = await adminModel
      .find({ "empData.0": { $exists: true } })
      .select("_id empData")
      .lean();

    if (admins.length === 0) {
      logger.warn(
        "[EMP-EXIT-SYNC] no admins have empData configured — nothing to sync " +
          "(this is expected only if no admin has linked an EmpMonitor org yet)",
      );
    }

    for (const admin of admins) {
      totals.admins += 1;
      try {
        const result = await syncAdmin(admin);
        totals.processed += result.processed;
        totals.matched += result.matched;
        totals.suspended += result.suspended;
      } catch (err) {
        logger.error(`[EMP-EXIT-SYNC] admin ${admin._id}: sync failed: ${err?.message}`);
      }
    }

    logger.info(
      `[EMP-EXIT-SYNC] sync complete: ${totals.admins} admins, ${totals.processed} employees processed, ` +
        `${totals.matched} matching VideoRDB users found, ${totals.suspended} suspended`,
    );
  } catch (err) {
    logger.error(`[EMP-EXIT-SYNC] sync failed: ${err?.message}`);
  } finally {
    running = false;
  }
  return totals;
}

/**
 * Start the periodic sync: first run shortly after boot, then every
 * intervalHours. Plain in-process timers, matching scheduleRetentionSweep.
 * Safe to call unconditionally; does nothing when EmpExitSync.enabled is
 * explicitly false.
 */
export function scheduleEmpExitSync() {
  try {
    const cfg = config.has("EmpExitSync") ? config.get("EmpExitSync") : {};
    if (cfg.enabled === false) {
      logger.info("[EMP-EXIT-SYNC] disabled via config — sync not scheduled");
      return;
    }
    const intervalMs = Math.max(Number(cfg.intervalHours) || 1, 1) * 3_600_000;
    const startDelayMs = 5 * 60_000; // let the server settle before the first run

    const guarded = () =>
      runEmpExitSync().catch((err) =>
        // runEmpExitSync never throws, but the process exits on any
        // unhandled rejection — belt and braces.
        logger.error(`[EMP-EXIT-SYNC] unexpected sync rejection: ${err?.message}`),
      );

    setTimeout(guarded, startDelayMs).unref();
    setInterval(guarded, intervalMs).unref();
    logger.info(
      `[EMP-EXIT-SYNC] scheduled: first run in 5m, then every ${intervalMs / 3_600_000}h`,
    );
  } catch (err) {
    logger.error(`[EMP-EXIT-SYNC] failed to schedule sync: ${err?.message}`);
  }
}

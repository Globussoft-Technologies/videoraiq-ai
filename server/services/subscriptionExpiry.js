import { isLocalXrayTest } from "../core/v2/xray/dev/localTestSafety.js";
import Admin from '../core/v1/admin/admin.model.js';
import Channel from '../core/v1/channels/channels.model.js';
import GlobalSchedule from '../core/v1/globalSchedule/globalSchedule.model.js';
import AttendanceReport from '../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.model.js';
import MeasurementReport from '../core/v2/measurementAutoEmailReport/measurementAutoEmailReport.model.js';
import SolderReport from '../core/v2/solderAutoEmailReport/solderAutoEmailReport.model.js';
import LegacyReport from '../core/v1/autoEmailReport/autoEmailReport.model.js';
import User from '../core/v1/users/users.model.js';
import { stopAllStreams } from '../utils/stopStreams.js';
import logger from '../utils/logger.js';

// Persist the scheduler barrier before removing schedules or stopping streams.
// Repeated expired requests retry cleanup; one failed write must not skip others.
export async function expireSubscription(adminId) {
  if (isLocalXrayTest()) return;
  if (!adminId) return;
  const owner = await Admin.findById(adminId).select('user_id').lean();
  if (!owner) return;
  await Admin.updateOne({ _id: adminId }, { $set: { streamsStopped: true } });
  try {
    // Update existing links in place: keep setting IDs, zones and schedules,
    // but make every toggle reflect the stopped state (including attendance).
    await Channel.updateMany({ userId: String(owner.user_id) }, [{
      $set: {
        subscriptionPaused: true,
        detectionBulkPaused: true,
        checkType: 'none',
        detections: { $arrayToObject: { $map: {
          input: { $objectToArray: { $ifNull: ['$detections', {}] } },
          as: 'detection',
          in: { k: '$$detection.k', v: { $mergeObjects: ['$$detection.v', { enabled: false }] } },
        } } },
      },
    }]).setOptions({ includeInactive: true });
    const members = await User.find({ adminId }).select('_id').lean();
    const results = await Promise.allSettled([
      GlobalSchedule.deleteMany({ $or: [{ adminId: String(adminId) }, { userId: String(owner.user_id) }] }),
      ...[AttendanceReport, MeasurementReport, SolderReport].map(model =>
        model.updateMany({ adminId }, { $set: { enabled: false } })),
      LegacyReport.updateMany({ $or: [{ adminId }, { userId: { $in: members.map(user => user._id) } }] },
        { $set: { frequency: [], sendTestMail: false } }),
    ]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  } finally {
    stopAllStreams(adminId);
  }
}

// Renewal restores account access, never detector execution. Also catch an
// expiry that occurred while the API was offline and was renewed before login.
export async function activateSubscription(owner, subscriptions) {
  if (isLocalXrayTest()) return;
  if (!owner?._id) return;
  const previousExpiry = owner.subscriptionSnapshot?.expiresAt;
  if (owner.streamsStopped || (previousExpiry && new Date(previousExpiry) < new Date())) {
    await expireSubscription(owner._id);
  }
  const entries = Object.entries(subscriptions || {}).filter(([, value]) => value);
  const expiries = entries.map(([, value]) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }).filter(Boolean);
  const expiresAt = expiries.length ? new Date(Math.max(...expiries.map(date => date.getTime()))) : null;
  await Admin.updateOne({ _id: owner._id }, { $set: {
    streamsStopped: false,
    'subscriptionSnapshot.subscriptions': Object.fromEntries(entries),
    'subscriptionSnapshot.expiresAt': expiresAt,
    'subscriptionSnapshot.syncedAt': new Date(),
  } });
}

export async function runSubscriptionExpirySweep(now = new Date()) {
  if (isLocalXrayTest()) return;
  const owners = await Admin.find({
    'subscriptionSnapshot.expiresAt': { $ne: null, $lt: now },
  }).select('_id').lean();
  for (const owner of owners) {
    try {
      // Repeated sweeps retry failed remote stops as well as failed cleanup.
      await expireSubscription(owner._id);
    } catch (error) {
      logger.error(`[PLAN_EXPIRED] cleanup failed for ${owner._id}: ${error.message}`);
    }
  }
}

export function scheduleSubscriptionExpirySweep() {
  if (isLocalXrayTest()) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runSubscriptionExpirySweep(); }
    catch (error) { logger.error(`[PLAN_EXPIRED] sweep failed: ${error.message}`); }
    finally { running = false; }
  };
  void tick();
  setInterval(tick, 60_000).unref();
}

import Admin from '../core/v1/admin/admin.model.js';
import Channel from '../core/v1/channels/channels.model.js';
import GlobalSchedule from '../core/v1/globalSchedule/globalSchedule.model.js';
import AttendanceReport from '../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.model.js';
import MeasurementReport from '../core/v2/measurementAutoEmailReport/measurementAutoEmailReport.model.js';
import SolderReport from '../core/v2/solderAutoEmailReport/solderAutoEmailReport.model.js';
import LegacyReport from '../core/v1/autoEmailReport/autoEmailReport.model.js';
import User from '../core/v1/users/users.model.js';
import { stopAllStreams } from '../utils/stopStreams.js';

// Persist the scheduler barrier before removing schedules or stopping streams.
// Repeated expired requests retry cleanup; one failed write must not skip others.
export async function expireSubscription(adminId) {
  if (!adminId) return;
  const owner = await Admin.findById(adminId).select('user_id').lean();
  if (!owner) return;
  await Admin.updateOne({ _id: adminId }, { $set: { streamsStopped: true } });
  try {
    await Channel.updateMany({ userId: String(owner.user_id) }, {
      $set: { subscriptionPaused: true, detectionBulkPaused: true },
    }).setOptions({ includeInactive: true });
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

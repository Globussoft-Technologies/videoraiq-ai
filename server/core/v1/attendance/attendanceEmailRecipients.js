import Recipient from "../verifyRecipients/recipients.model.js";

export async function attendanceEmailRecipients({ channel, admin }) {
  if (!['checkin', 'checkout'].includes(channel?.checkType)) {
    return admin?.email ? [admin.email] : [];
  }

  if (admin?.emailAlertsEnabled === false) return [];

  if (!channel?.attendanceEmailRecipients?.length) return [];

  const selected = await Recipient.find({
    _id: { $in: channel.attendanceEmailRecipients },
    adminId: admin._id,
    type: 'email',
    verified: true,
  }).select('value -_id').lean();

  return [...new Set(selected.map((recipient) => recipient.value))];
}

import RecipientModel from "./recipients.model.js";
import AlertsConfig from "../alerts/alerts.model.js";
import Channel from "../channels/channels.model.js";
import Profile from "../profiles/profiles.model.js";
import { DetectionSetting } from "../detectionSettings/detectionSettings.model.js";
import logger from "../../../utils/logger.js";

// Every login user (Users page) has one email alert recipient, linked by
// recipient.userId. Name and email follow the user. What the
// recipient is alerted about (incidentTypes, severities, and the
// detections / cameras / profiles it was added to) stays admin-owned.
//
// Both exports log and swallow their errors: a recipient sync must never fail
// the user save or delete that triggered it.

// Every list that holds recipient ids.
const MEMBERSHIPS = [
  [DetectionSetting, "alerts"],
  [Channel, "alerts"],
  [Profile, "notification.recipients"],
];

const normalize = (email) => String(email || "").trim().toLowerCase();
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Recipient values are stored as typed, so match the address in any case.
const sameAddress = (adminId, email) => ({
  adminId,
  type: "email",
  value: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
});

const moveMemberships = async (fromId, toId) => {
  for (const [Model, path] of MEMBERSHIPS) {
    // Two updates: Mongo refuses $addToSet and $pull on one path at once.
    await Model.updateMany({ [path]: fromId }, { $addToSet: { [path]: toId } });
    await Model.updateMany({ [path]: fromId }, { $pull: { [path]: fromId } });
  }
};

const dropMemberships = async (ids) => {
  for (const [Model, path] of MEMBERSHIPS) {
    await Model.updateMany({ [path]: { $in: ids } }, { $pull: { [path]: { $in: ids } } });
  }
};

/**
 * Link (or create) the user's recipient and copy name and email onto it.
 * Pass `verified: true` only when the caller has just verified the
 * user's address (v2 create, or an email change); an address that changes
 * without that is marked unverified unless it already had a verified row.
 */
export const syncUserRecipient = async (user, { verified = false } = {}) => {
  try {
    const email = normalize(user?.email);
    if (!user?._id || !user?.adminId || !email) return null;
    const { adminId, _id: userId } = user;
    const synced = {
      value: email,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.userName || null,
    };

    const linked = await RecipientModel.findOne({ adminId, userId });
    // A row with this address that belongs to no user: one an admin added, or
    // the user's new address that was already a recipient.
    const unlinked = await RecipientModel.findOne({ ...sameAddress(adminId, email), userId: null });

    if (!linked) {
      if (unlinked) {
        return await RecipientModel.findByIdAndUpdate(
          unlinked._id,
          { $set: { ...synced, userId, ...(verified ? { verified: true } : {}) } },
          { new: true },
        );
      }
      return await RecipientModel.create({
        adminId,
        type: "email",
        ...synced,
        userId,
        autoCreated: true,
        verified: Boolean(verified),
        incidentTypes: [],
      });
    }

    if (unlinked) {
      // The user moved to an address that had its own row. Fold it into the
      // user's row so nobody is alerted twice, keeping its detections and
      // subscribed incident types.
      await moveMemberships(unlinked._id, linked._id);
      await RecipientModel.deleteOne({ _id: unlinked._id });
      synced.incidentTypes = [...new Set([...(linked.incidentTypes || []), ...(unlinked.incidentTypes || [])])];
    }

    const addressChanged = normalize(linked.value) !== email;
    if (verified) synced.verified = true;
    else if (addressChanged) synced.verified = Boolean(unlinked?.verified);

    return await RecipientModel.findByIdAndUpdate(
      linked._id,
      {
        $set: synced,
        // A link mailed to the old address must not verify the new one.
        ...(addressChanged ? { $unset: { verifyOTP: 1, otpExpireDate: 1 } } : {}),
      },
      { new: true },
    );
  } catch (error) {
    logger.error(`[RECIPIENT_SYNC] user ${user?._id}: ${error.message}`);
    return null;
  }
};

/**
 * On user delete: rows created for the user go with them (and out of every
 * list that held them); rows an admin added first are only unlinked, so they
 * keep alerting that address as before.
 */
export const removeUserRecipients = async (userIds) => {
  try {
    const ids = [].concat(userIds || []).filter(Boolean);
    if (!ids.length) return;
    const rows = await RecipientModel.find({ userId: { $in: ids } })
      .select("_id adminId value autoCreated")
      .lean();

    const created = rows.filter((row) => row.autoCreated);
    const adopted = rows.filter((row) => !row.autoCreated).map((row) => row._id);

    if (created.length) {
      const createdIds = created.map((row) => row._id);
      await RecipientModel.deleteMany({ _id: { $in: createdIds } });
      await dropMemberships(createdIds);
      // Same cleanup as deleting a recipient on the Alert Recipients page.
      for (const row of created) {
        await AlertsConfig.updateOne({ adminId: row.adminId }, { $pull: { emails: row.value } });
      }
    }
    if (adopted.length) {
      await RecipientModel.updateMany({ _id: { $in: adopted } }, { $unset: { userId: 1 } });
    }
  } catch (error) {
    logger.error(`[RECIPIENT_SYNC] remove users ${[].concat(userIds || []).join(",")}: ${error.message}`);
  }
};

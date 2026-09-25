import Admin from "../admin/admin.model.js";
import { Incident } from "../incidents/incidents.model.js";
import NVR from "../NVR/nvr.model.js";
import Channel from "../channels/channels.model.js";
import { DetectionSetting } from "../detectionSettings/detectionSettings.model.js";
import GlobalSchedule from "../globalSchedule/globalSchedule.model.js";
import Department from "../departments/departments.model.js";
import Recipient from "../verifyRecipients/recipients.model.js";
import Alert from "../alerts/alerts.model.js";
import AuthorizedUser from "../authorizedUsers/authorizedUsers.model.js";
import AuthorizedChannel from "../cameraRestrictions/authorizedChannels.model.js";
import AuthorizedObject from "../authorizedObjects/authorizedObjects.model.js";
import Location from "../locations/location.model.js";
import Role from "../roles/roles.model.js";
import Permission from "../permission/permissions.model.js";
import Profile from "../profiles/profiles.model.js";
import DashboardSidebar from "../dashboard/dashboardSidebar.model.js";
import Attendance from "../attendance/attendance.model.js";
import AttendanceSettings from "../attendance/attendanceSettings.model.js";
import AccessLog from "../accesslogs/accesslogs.model.js";
import OptimizedAccessLog from "../accesslogs/newAccessLogs.model.js";
import TestAccessLog from "../accesslogs/reworkedAccesslogs.model.js";
import Shift from "../shifts/shifts.model.js";
import ShiftSchedule from "../shifts/shiftSchedule.model.js";
import Entry from "../entry/entry.model.js";
import EntryUser from "../entry/user.model.js";
import VehicleLog from "../vehicle/vehicle.log.model.js";
import FileRecord from "../files/files.model.js";
import Storage from "../storage/storage.model.js";
import AutoEmailReport from "../autoEmailReport/autoEmailReport.model.js";
import ClientDetectionAllocation from "../clientConfig/clientDetectionAllocation.model.js";
import ClientCameraDetection from "../clientConfig/clientCameraDetection.model.js";
import FaceImage from "../faceImages/faceImages.model.js";
import User from "../users/users.model.js";
import LiveDemo from "../videoRecords/videoRecords.model.js";
import AttendanceAutoEmailReport from "../attendanceAutoEmailReport/attendanceAutoEmailReport.model.js";
import MeasurementAutoEmailReport from "../measurementAutoEmailReport/measurementAutoEmailReport.model.js";
import LogsConfiguration from "../logsConfiguration/logsConfiguration.model.js";
import AssistantConversation from "../assistant/assistantConversation.model.js";
import AdminStorageConfig from "../adminStorage/adminStorage.model.js";
import EmailMessage from "../emailMonitoring/emailMessage.model.js";
import MeasurementIncident from "../measurementIncidents/measurementIncidents.model.js";
import MeasurementCalibration from "../measurementCalibration/measurementCalibration.model.js";
import MeasurementMedia from "../measurementMedia/measurementMedia.model.js";
import RaspberryPiDevice from "../raspberryPi/raspberryPi.model.js";
import MeasurementCapture from "../measurements/measurementCapture.model.js";

const countResult = (result) => Number(result?.deletedCount || 0);

/**
 * Permanently remove database records owned by one aMember-backed tenant.
 *
 * The codebase has two ownership conventions:
 * - adminId/admin/user: the Admin document's Mongo ObjectId
 * - userId: the numeric aMember user_id stored as a string on camera/detection data
 *
 * The Admin row is deleted last. If any child deletion fails, the webhook can
 * be retried because the identity used to locate the tenant still exists.
 * Shared catalogs (detection types, vehicle definitions, etc.) are excluded.
 */
export async function purgeAmemberTenantData(admin) {
  if (!admin?._id || admin?.user_id == null) {
    throw new Error("Admin _id and aMember user_id are required for tenant deletion");
  }

  const adminId = admin._id;
  const amemberUserId = String(admin.user_id);
  const adminIdString = String(adminId);

  // EntryUser has no tenant field. Capture only the IDs referenced by this
  // tenant's Entry rows before those rows are removed.
  const [entryUserIds, memberIds, stationIds] = await Promise.all([
    Entry.find({ adminId }).distinct("userId"),
    User.find({ adminId }).distinct("_id"),
    RaspberryPiDevice.find({ admin: adminId }).distinct("mac"),
  ]);
  const sharedEntryUserIds = entryUserIds.length
    ? await Entry.find({
        adminId: { $ne: adminId },
        userId: { $in: entryUserIds },
      }).distinct("userId")
    : [];
  const sharedEntryUserIdSet = new Set(sharedEntryUserIds.map(String));
  const ownedEntryUserIds = entryUserIds.filter(
    (entryUserId) => !sharedEntryUserIdSet.has(String(entryUserId)),
  );

  const operations = [
    ["incidents", Incident.deleteMany({ userId: amemberUserId })],
    ["nvrs", NVR.deleteMany({ userId: amemberUserId })],
    ["channels", Channel.deleteMany({ userId: amemberUserId })],
    ["detectionSettings", DetectionSetting.deleteMany({ userId: amemberUserId })],
    ["globalSchedules", GlobalSchedule.deleteMany({
      $or: [{ userId: amemberUserId }, { adminId: adminIdString }],
    })],
    ["departments", Department.deleteMany({ adminId })],
    ["recipients", Recipient.deleteMany({ adminId })],
    ["alerts", Alert.deleteMany({ adminId })],
    ["authorizedUsers", AuthorizedUser.deleteMany({ adminId })],
    ["authorizedChannels", AuthorizedChannel.deleteMany({ adminId })],
    ["authorizedObjects", AuthorizedObject.deleteMany({ admin: adminId })],
    ["locations", Location.deleteMany({ adminId })],
    ["roles", Role.deleteMany({ adminId })],
    ["permissions", Permission.deleteMany({ adminId })],
    ["profiles", Profile.deleteMany({ user: adminId })],
    ["dashboardSidebar", DashboardSidebar.deleteMany({ adminId })],
    ["attendance", Attendance.deleteMany({ user: adminId })],
    ["attendanceSettings", AttendanceSettings.deleteMany({ adminId })],
    ["accessLogs", AccessLog.deleteMany({ admin: adminId })],
    ["optimizedAccessLogs", OptimizedAccessLog.deleteMany({ admin: adminId })],
    ["testAccessLogs", TestAccessLog.deleteMany({ admin: adminId })],
    ["shifts", Shift.deleteMany({ adminId })],
    ["shiftSchedules", ShiftSchedule.deleteMany({ adminId })],
    ["entries", Entry.deleteMany({ adminId })],
    ["entryUsers", ownedEntryUserIds.length
      ? EntryUser.deleteMany({ _id: { $in: ownedEntryUserIds } })
      : Promise.resolve({ deletedCount: 0 })],
    ["vehicleLogs", VehicleLog.deleteMany({ adminId })],
    ["files", FileRecord.deleteMany({ userId: adminId })],
    ["storage", Storage.deleteMany({ userId: adminId })],
    ["autoEmailReports", AutoEmailReport.deleteMany({
      $or: [
        { adminId },
        ...(memberIds.length ? [{ userId: { $in: memberIds } }] : []),
      ],
    })],
    ["clientDetectionAllocations", ClientDetectionAllocation.deleteMany({ adminId })],
    ["clientCameraDetections", ClientCameraDetection.deleteMany({ adminId })],
    ["faceImages", FaceImage.deleteMany({ adminId })],
    ["members", User.deleteMany({ adminId })],
    ["liveDemos", LiveDemo.deleteMany({ adminId })],
    ["attendanceAutoEmailReports", AttendanceAutoEmailReport.deleteMany({ adminId })],
    ["measurementAutoEmailReports", MeasurementAutoEmailReport.deleteMany({ adminId })],
    ["logsConfiguration", LogsConfiguration.deleteMany({ adminId })],
    ["assistantConversations", AssistantConversation.deleteMany({ adminId })],
    ["adminStorage", AdminStorageConfig.deleteMany({ adminId })],
    ["emailMessages", EmailMessage.deleteMany({ adminId })],
    ["measurementIncidents", MeasurementIncident.deleteMany({ adminId: adminIdString })],
    ["measurementCalibration", MeasurementCalibration.deleteMany({ adminId: adminIdString })],
    ["measurementMedia", MeasurementMedia.deleteMany({ adminId: adminIdString })],
    ["raspberryPiDevices", RaspberryPiDevice.deleteMany({ admin: adminId })],
    ["measurementCaptures", stationIds.length
      ? MeasurementCapture.deleteMany({
          stationId: { $in: stationIds.map((value) => String(value).toLowerCase()) },
        })
      : Promise.resolve({ deletedCount: 0 })],
  ];

  const results = await Promise.all(operations.map(([, operation]) => operation));
  const deleted = Object.fromEntries(
    operations.map(([name], index) => [name, countResult(results[index])]),
  );

  const adminResult = await Admin.deleteOne({ _id: adminId, user_id: amemberUserId });
  if (adminResult.deletedCount !== 1) {
    throw new Error("Admin disappeared before tenant deletion completed");
  }
  deleted.admins = 1;

  return deleted;
}

export default { purgeAmemberTenantData };

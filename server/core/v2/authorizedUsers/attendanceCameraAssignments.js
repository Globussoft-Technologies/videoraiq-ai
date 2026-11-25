import mongoose from "mongoose";
import Channel from "../channels/channels.model.js";

const cameraFields = [
  { field: 'checkinCameraIds', legacy: 'checkInCameraId', label: 'check-in', checkType: 'checkin' },
  { field: 'checkoutCameraIds', legacy: 'checkOutCameraId', label: 'check-out', checkType: 'checkout' },
];

export const hasAttendanceCameraAssignments = (input) => cameraFields.some(({ field, legacy }) =>
  input?.[field] != null || input?.[legacy] != null
);

export function storedAttendanceCameraAssignments(record) {
  const assignments = {};
  for (const { field, legacy } of cameraFields) {
    if (Array.isArray(record?.[field])) assignments[field] = record[field].map(String);
    else if (record?.[legacy]) assignments[field] = [String(record[legacy])];
  }
  return assignments;
}

export async function fillDepartmentAttendanceCameras(assignments, departmentId, admin, verified, { existing, departmentChanged = false } = {}) {
  if (!departmentId) return assignments;

  const saved = storedAttendanceCameraAssignments(existing);
  const missing = cameraFields.filter(({ field }) =>
    !Object.hasOwn(assignments, field) && (departmentChanged || !Object.hasOwn(saved, field))
  );
  if (!missing.length) return assignments;

  const query = {
    userId: admin.user_id,
    department: departmentId,
    checkType: { $in: missing.map(({ checkType }) => checkType) },
  };
  if (verified?.userData?.memberId) query._id = { $in: verified.authorizedChannel?.channels || [] };

  const channels = await Channel.find(query).select('_id checkType').sort({ createdAt: -1, _id: -1 }).lean();
  const result = { ...assignments };
  for (const { field, checkType } of missing) {
    const ids = channels.filter(camera => camera.checkType === checkType).map(camera => String(camera._id));
    if (ids.length || (departmentChanged && saved[field]?.length)) result[field] = ids;
  }
  return result;
}

export async function validateAttendanceCameraAssignments(input, admin, verified) {
  const assignments = {};
  for (const { field, legacy, label } of cameraFields) {
    const value = input?.[field] === undefined ? input?.[legacy] : input[field];
    if (value == null) continue;

    // Multer returns a string for one field and an array for repeated fields.
    const ids = value === '' ? [] : (Array.isArray(value) ? value : [value]);
    const error = `Select valid ${label} cameras`;
    if (ids.some(id => !mongoose.isObjectIdOrHexString(id))) return { error };

    const cameras = [...new Set(ids.map(id => String(id).toLowerCase()))];
    if (cameras.length) {
      if (verified?.userData?.memberId) {
        const accessible = new Set((verified.authorizedChannel?.channels || []).map(String));
        if (cameras.some(id => !accessible.has(id))) return { error };
      }
      const count = await Channel.countDocuments({ _id: { $in: cameras }, userId: admin.user_id });
      if (count !== cameras.length) return { error };
    }
    assignments[field] = cameras;
  }
  return { assignments };
}

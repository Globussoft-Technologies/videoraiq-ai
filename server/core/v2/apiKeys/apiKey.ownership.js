import mongoose from 'mongoose';

const MODULE_MODELS = {
  nvr: 'NVR', channel: 'Channel', incidents: 'Incident', profiles: 'Profile', users: 'users', authorizedUsers: 'authorizedUsers',
  roles: 'role', permissions: 'permissionSchema', departments: 'Department', locations: 'Location', shifts: 'Shift',
  'global-schedules': 'GlobalSchedule', 'detection-settings': 'DetectionSetting', authorizedObjects: 'authorizedObjects', recipients: 'recipients',
  'auto-email-report': 'autoEmailReportSchema', 'attendance-auto-email-reports': 'AttendanceAutoEmailReport',
  'measurement-auto-email-reports': 'MeasurementAutoEmailReport', 'solder-auto-email-reports': 'SolderAutoEmailReport',
  'measurement-incidents': 'MeasurementIncident', 'measurement-media': 'MeasurementMedia', 'video-records': 'LiveDemo',
};
const REFERENCE_FIELDS = {
  nvrId: 'NVR', nvrIds: 'NVR', channelId: 'Channel', channelIds: 'Channel', cameraId: 'Channel', cameraIds: 'Channel',
  incidentId: 'Incident', incidentIds: 'Incident', roleId: 'role', roleIds: 'role', permissionId: 'permissionSchema',
  departmentId: 'Department', departmentIds: 'Department', shiftId: 'Shift', profileId: 'Profile', profileIds: 'Profile',
  recipientId: 'recipients', accessLogId: 'AccessLogs', employeeIds: 'authorizedUsers', authorizedUserId: 'authorizedUsers',
};

// Legacy handlers sometimes look up IDs without the owner in their query. Validate
// references at the gateway, and again after multipart parsing in verifyToken.
export async function checkKeyOwnership(req, admin) {
  const parts = new URL(req.originalUrl, 'https://api.local').pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const module = parts[2];
  const moduleModel = MODULE_MODELS[module];
  const groups = new Map();
  const add = (name, value) => {
    for (const id of Array.isArray(value) ? value : [value]) {
      if (!mongoose.isValidObjectId(id)) throw new Error('Invalid resource reference');
      if (!groups.has(name)) groups.set(name, new Set());
      groups.get(name).add(String(id));
      if (groups.get(name).size > 1000) throw new Error('Too many resource references');
    }
  };
  const visit = (source, depth = 0) => {
    if (!source || typeof source !== 'object' || Buffer.isBuffer(source)) return;
    if (depth > 8) throw new Error('Request nesting too deep');
    if (Array.isArray(source)) { for (const item of source) visit(item, depth + 1); return; }
    for (const [field, value] of Object.entries(source)) {
      if (value == null || value === '') continue;
      if (['adminId', 'admin_id', 'targetAdminId'].includes(field) && String(value) !== String(admin._id)) throw new Error('Admin account mismatch');
      if (field === 'user_id' && String(value) !== String(admin.user_id)) throw new Error('Account mismatch');
      if (REFERENCE_FIELDS[field]) add(REFERENCE_FIELDS[field], value);
      else if (field === 'recipients' && module === 'profiles') add('recipients', value);
      else if (['id', '_id', 'ids'].includes(field) && moduleModel && depth === 0) add(moduleModel, value);
      else if (['userId', 'userIds'].includes(field)) {
        if (module === 'users' || module === 'authorizedUsers') add(moduleModel, value);
        else if (module === 'admin' && String(value) !== String(admin.user_id)) throw new Error('Account mismatch');
      }
      if (typeof value === 'object') visit(value, depth + 1);
    }
  };
  visit(req.query); visit(req.body);
  if (moduleModel) for (const [index, part] of parts.entries()) {
    if (index <= 2 || !mongoose.isValidObjectId(part)) continue;
    const previous = parts[index - 1];
    if (module === 'channel' && previous === 'nvr-camera-detections') {
      if (part !== String(admin._id)) throw new Error('Admin account mismatch');
      continue;
    }
    if (module === 'incidents' && previous === 'deletion-status') continue;
    add(module === 'nvr' && previous === 'camera' ? 'Channel' : previous === 'nvr' ? 'NVR' : moduleModel, part);
  }
  for (const [name, ids] of groups) {
    const model = mongoose.models[name];
    if (!model) throw new Error('Resource unavailable');
    const owner = name === 'Profile' ? { user: admin._id } : model.schema.path('admin') ? { admin: admin._id }
      : model.schema.path('adminId') ? { adminId: admin._id } : { userId: String(admin.user_id) };
    if (await model.countDocuments({ _id: { $in: [...ids] }, ...owner }).setOptions({ includeInactive: true }) !== ids.size) throw new Error('Resource does not belong to this admin');
  }
}

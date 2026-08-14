const apiPrefixes = (path, module) => [
  { prefix: `/api/v2${path}`, module },
  { prefix: `/api/v1${path}`, module },
];

const buildPathMap = (entries) => entries.flatMap(({ path, module }) => apiPrefixes(path, module));

const normalizePath = (mainPath = '') => {
  if (!mainPath) return '';
  return mainPath.endsWith('/') ? mainPath.slice(0, -1) : mainPath;
};

const findModule = (mainPath = '', pathMap = []) => {
  const normalizedPath = normalizePath(mainPath);
  if (!normalizedPath) return '';

  const match = pathMap.find((item) => normalizedPath.startsWith(item.prefix));
  return match ? match.module : '';
};

const viewPathMap = [
  ...buildPathMap([
    { path: '/permissions', module: 'permission' },
    { path: '/locations', module: 'locations' },
    { path: '/authorizedUsers', module: 'Users' },
    { path: '/users', module: 'Users' },
    { path: '/channel/playback', module: 'playbacks' },
    { path: '/channel/detection', module: 'detectionSettings' },
    { path: '/channel', module: 'channels' },
    { path: '/dashboard', module: 'dashboard' },
    { path: '/alerts', module: 'alerts' },
    { path: '/analytics', module: 'dashboard' },
    { path: '/departments', module: 'departments' },
    { path: '/detection-settings', module: 'detectionSettings' },
    { path: '/detection-objects', module: 'detectionSettings' },
    { path: '/incidents', module: 'incidents' },
    { path: '/nvr', module: 'NVR' },
    { path: '/profiles', module: 'profiles' },
    { path: '/roles', module: 'roles' },
    { path: '/recipients', module: 'recipients' },
    { path: '/attendance', module: 'logs' },
    { path: '/attendance-auto-email-reports', module: 'logs' },
    { path: '/accessLogs', module: 'logs' },
    { path: '/entry', module: 'logs' },
    { path: '/vehicle', module: 'logs' },
    { path: '/faceImages', module: 'Users' },
  ]),
];

const createPathMap = [
  { prefix: '/v1/user/bulk-register', module: 'upload' },
  ...buildPathMap([
    { path: '/permissions', module: 'permission' },
    { path: '/locations', module: 'locations' },
    { path: '/authorizedUsers', module: 'Users' },
    { path: '/users', module: 'Users' },
    { path: '/departments', module: 'departments' },
    { path: '/detection-settings', module: 'detectionSettings' },
    { path: '/incidents', module: 'incidents' },
    { path: '/nvr', module: 'NVR' },
    { path: '/profiles', module: 'profiles' },
    { path: '/roles', module: 'roles' },
    { path: '/recipients', module: 'recipients' },
    { path: '/shifts', module: 'shifts' },
    { path: '/attendance-auto-email-reports', module: 'logs' },
    { path: '/faceImages', module: 'Users' },
  ]),
];

const editPathMap = [
  ...buildPathMap([
    { path: '/locations', module: 'locations' },
    { path: '/permissions', module: 'permission' },
    { path: '/authorizedUsers', module: 'Users' },
    { path: '/users', module: 'Users' },
    { path: '/channel/detection', module: 'detectionSettings' },
    { path: '/channel', module: 'channels' },
    { path: '/departments', module: 'departments' },
    { path: '/detection-settings', module: 'detectionSettings' },
    { path: '/incidents', module: 'incidents' },
    { path: '/nvr', module: 'NVR' },
    { path: '/profiles', module: 'profiles' },
    { path: '/roles', module: 'roles' },
    { path: '/recipients', module: 'recipients' },
    { path: '/shifts', module: 'shifts' },
    { path: '/attendance-auto-email-reports', module: 'logs' },
    { path: '/faceImages', module: 'Users' },
  ]),
];

const deletePathMap = [
  { prefix: '/v1/user', module: 'employee' },
  ...buildPathMap([
    { path: '/permissions', module: 'permission' },
    { path: '/locations', module: 'locations' },
    { path: '/authorizedUsers', module: 'Users' },
    { path: '/users', module: 'Users' },
    { path: '/channel', module: 'channels' },
    { path: '/departments', module: 'departments' },
    { path: '/detection-settings', module: 'detectionSettings' },
    { path: '/detection-objects', module: 'detectionSettings' },
    { path: '/incidents', module: 'incidents' },
    { path: '/nvr', module: 'NVR' },
    { path: '/profiles', module: 'profiles' },
    { path: '/roles', module: 'roles' },
    { path: '/recipients', module: 'recipients' },
    { path: '/shifts', module: 'shifts' },
    { path: '/attendance-auto-email-reports', module: 'logs' },
    { path: '/faceImages', module: 'Users' },
  ]),
];

export const viewPermissionConfigChecker = (mainPath = '') => findModule(mainPath, viewPathMap);

export const createPermissionConfigChecker = (mainPath = '') => findModule(mainPath, createPathMap);

export const editPermissionConfigChecker = (mainPath = '') => findModule(mainPath, editPathMap);

export const deletePermissionConfigChecker = (mainPath = '') => findModule(mainPath, deletePathMap);

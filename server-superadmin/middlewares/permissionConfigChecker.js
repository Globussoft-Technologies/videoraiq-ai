
export const viewPermissionConfigChecker = (mainPath = '') => {
  if (!mainPath) return '';

  // Normalize: remove trailing slash if exists
  const normalizedPath = mainPath.endsWith('/')
    ? mainPath.slice(0, -1)
    : mainPath;

  const pathMap = [
    // Permissions
    { prefix: '/api/v1/permissions', module: 'permission' },

    // Locations
    { prefix: '/api/v1/locations', module: 'locations' },

    // Authorized Users
    { prefix: '/api/v1/authorizedUsers', module: 'Users' },

    // Users
    { prefix: '/api/v1/users', module: 'Users' },

    // Playbacks (put before /channel to avoid overlap)
    { prefix: '/api/v1/channel/playback', module: 'playbacks' },

    // Channels
    { prefix: '/api/v1/channel', module: 'channels' },

    // Dashboard
    { prefix: '/api/v1/dashboard', module: 'dashboard' },

    // Departments
    { prefix: '/api/v1/departments', module: 'departments' },

    // Detection Settings
    { prefix: '/api/v1/detection-settings', module: 'detectionSettings' },

    // Incidents
    { prefix: '/api/v1/incidents', module: 'incidents' },

    // NVRs (fixed prefix)
    { prefix: '/api/v1/nvr', module: 'NVR' },

    // Profiles
    { prefix: '/api/v1/profiles', module: 'profiles' },

    // Roles
    { prefix: '/api/v1/roles', module: 'roles' },

    // Recipients
    { prefix: '/api/v1/recipients', module: 'recipients' },

    // Attendance logs
    { prefix: '/api/v1/attendance', module: 'logs' },

    // Access logs
    { prefix: '/api/v1/accessLogs', module: 'logs' },
  ];

  const match = pathMap.find((item) =>
    normalizedPath.startsWith(item.prefix)
  );

  return match ? match.module : '';
};



export const createPermissionConfigChecker = (mainPath = '') => {
  if (!mainPath) return '';

  // Normalize: remove trailing slash if exists
  const normalizedPath = mainPath.endsWith('/')
    ? mainPath.slice(0, -1)
    : mainPath;

  const pathMap = [
    // Upload
    { prefix: '/v1/user/bulk-register', module: 'upload' },

    // Permissions
    { prefix: '/api/v1/permissions', module: 'permission' },

    // Locations
    { prefix: '/api/v1/locations', module: 'locations' },

    // Authorized Users
    { prefix: '/api/v1/authorizedUsers', module: 'Users' },

    // Users
    { prefix: '/api/v1/users', module: 'Users' },

    // Departments
    { prefix: '/api/v1/departments', module: 'departments' },

    // Detection Settings
    { prefix: '/api/v1/detection-settings', module: 'detectionSettings' },

    // Incidents
    { prefix: '/api/v1/incidents', module: 'incidents' },

    // NVRs (fixed prefix)
    { prefix: '/api/v1/nvr', module: 'NVR' },

    // Profiles
    { prefix: '/api/v1/profiles', module: 'profiles' },

    // Roles
    { prefix: '/api/v1/roles', module: 'roles' },

    // Recipients
    { prefix: '/api/v1/recipients', module: 'recipients' },

    // shifts
    { prefix: '/api/v1/shifts', module: 'shifts' },
  ];

  // Find matching module
  const match = pathMap.find((item) =>
    normalizedPath.startsWith(item.prefix)
  );

  return match ? match.module : '';
};


export const editPermissionConfigChecker = (mainPath = '') => {
  if (!mainPath) return '';

  // Normalize: remove trailing slash if exists
  const normalizedPath = mainPath.endsWith('/')
    ? mainPath.slice(0, -1)
    : mainPath;

  const pathMap = [
    // Location
    { prefix: '/api/v1/locations', module: 'locations' },

    // Permissions
    { prefix: '/api/v1/permissions', module: 'permission' },

    // Authorized Users
    { prefix: '/api/v1/authorizedUsers', module: 'Users' },

    // Users
    { prefix: '/api/v1/users', module: 'Users' },

    // Channels
    { prefix: '/api/v1/channel', module: 'channels' },

    // Departments
    { prefix: '/api/v1/departments', module: 'departments' },

    // Detection Settings
    { prefix: '/api/v1/detection-settings', module: 'detectionSettings' },

    // Incidents
    { prefix: '/api/v1/incidents', module: 'incidents' },

    // NVRs
    { prefix: '/api/v1/nvr', module: 'NVR' },

    // Profiles
    { prefix: '/api/v1/profiles', module: 'profiles' },

    // Roles
    { prefix: '/api/v1/roles', module: 'roles' },

    // Recipients
    { prefix: '/api/v1/recipients', module: 'recipients' },

    // shifts
    { prefix: '/api/v1/shifts', module: 'shifts' },
  ];

  const match = pathMap.find((item) =>
    normalizedPath.startsWith(item.prefix)
  );

  return match ? match.module : '';
};


export const deletePermissionConfigChecker = (mainPath = '') => {
  if (!mainPath) return '';

  // Normalize: remove trailing slash if exists
  const normalizedPath = mainPath.endsWith('/')
    ? mainPath.slice(0, -1)
    : mainPath;

  const pathMap = [
    // User
    { prefix: '/v1/user', module: 'employee' },

    // Permissions
    { prefix: '/api/v1/permissions', module: 'permission' },

    // Locations
    { prefix: '/api/v1/locations', module: 'locations' },

    // Authorized Users
    { prefix: '/api/v1/authorizedUsers', module: 'Users' },

    // Users
    { prefix: '/api/v1/users', module: 'Users' },

    // Channels
    { prefix: '/api/v1/channel', module: 'channels' },

    // Departments
    { prefix: '/api/v1/departments', module: 'departments' },

    // Detection Settings
    { prefix: '/api/v1/detection-settings', module: 'detectionSettings' },

    // Incidents
    { prefix: '/api/v1/incidents', module: 'incidents' },

    // NVRs
    { prefix: '/api/v1/nvr', module: 'NVR' },

    // Profiles
    { prefix: '/api/v1/profiles', module: 'profiles' },

    // Roles
    { prefix: '/api/v1/roles', module: 'roles' },

    // Recipients
    { prefix: '/api/v1/recipients', module: 'recipients' },

    // shifts
    { prefix: '/api/v1/shifts', module: 'shifts' },
  ];

  const match = pathMap.find((item) =>
    normalizedPath.startsWith(item.prefix)
  );

  return match ? match.module : '';
};


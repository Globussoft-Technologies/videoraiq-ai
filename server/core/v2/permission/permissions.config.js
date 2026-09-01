export let completeConfig = {
    NVR: { view: false, create: false, edit: false, delete: false },
    channels: { view: false, create: false, edit: false, delete: false },
    LIVE: { view: false, create: false, edit: false, delete: false },
    dashboard: { view: false, create: false, edit: false, delete: false },
    alerts: { view: false, create: false, edit: false, delete: false },
    analytics: { view: false, create: false, edit: false, delete: false },
    incidents: { view: false, create: false, edit: false, delete: false },
    Users: { view: false, create: false, edit: false, delete: false },
    permission: { view: false, create: false, edit: false, delete: false },
    roles: { view: false, create: false, edit: false, delete: false },
    settings: { view: false, create: false, edit: false, delete: false },
    departments: { view: false, create: false, edit: false, delete: false },
    detectionSettings: { view: false, create: false, edit: false, delete: false },
    profiles: { view: false, create: false, edit: false, delete: false },
    recipients: { view: false, create: false, edit: false, delete: false },
    autoEmailReports: { view: false, create: false, edit: false, delete: false },
    logs: {
        global: { view: false, create: false, edit: false, delete: false },
        accessLogs: { view: false, create: false, edit: false, delete: false },
        attendanceLogs: { view: false, create: false, edit: false, delete: false },
        taggedUsersLogs: { view: false, create: false, edit: false, delete: false },
        detectedUsersLogs: { view: false, create: false, edit: false, delete: false },
        personCountLogs: { view: false, create: false, edit: false, delete: false },
        deskLogs: { view: false, create: false, edit: false, delete: false },
        ANPRLogs: { view: false, create: false, edit: false, delete: false },
        productivityLogs: { view: false, create: false, edit: false, delete: false },
        trackLogs: { view: false, create: false, edit: false, delete: false },
        visibilityLogs: { view: false, create: false, edit: false, delete: false },
        guardLogs: { view: false, create: false, edit: false, delete: false },
        conveyorLogs: { view: false, create: false, edit: false, delete: false },
        vehicleObstructionLogs: { view: false, create: false, edit: false, delete: false },
        vehicleCountLogs: { view: false, create: false, edit: false, delete: false },
        crusherLogs: { view: false, create: false, edit: false, delete: false },
        lineCrossingLogs: { view: false, create: false, edit: false, delete: false },
        waterSpillLogs: { view: false, create: false, edit: false, delete: false },
        unauthorizedAccessLogs: { view: false, create: false, edit: false, delete: false },
        carLogs: { view: false, create: false, edit: false, delete: false }
    },
    locations: { view: false, create: false, edit: false, delete: false },
    playbacks: { view: false, create: false, edit: false, delete: false }

};

export let adminConfig = {
    NVR: { view: true, create: true, edit: true, delete: true },
    channels: { view: true, create: true, edit: true, delete: true },
    LIVE: { view: true, create: true, edit: true, delete: true },
    dashboard: { view: true, create: true, edit: true, delete: true },
    alerts: { view: true, create: true, edit: true, delete: true },
    analytics: { view: true, create: true, edit: true, delete: true },
    incidents: { view: true, create: true, edit: true, delete: true },
    Users: { view: true, create: true, edit: true, delete: true },
    permission: { view: true, create: true, edit: true, delete: true },
    roles: { view: true, create: true, edit: true, delete: true },
    settings: { view: true, create: true, edit: true, delete: true },
    departments: { view: true, create: true, edit: true, delete: true },
    recipients: { view: true, create: true, edit: true, delete: true },
    profiles: { view: true, create: true, edit: true, delete: true },
    detectionSettings: { view: true, create: true, edit: true, delete: true },
    autoEmailReports: { view: true, create: true, edit: true, delete: true },
    logs: {
        global: { view: true, create: true, edit: true, delete: true },
        accessLogs: { view: true, create: true, edit: true, delete: true },
        attendanceLogs: { view: true, create: true, edit: true, delete: true },
        taggedUsersLogs: { view: true, create: true, edit: true, delete: true },
        detectedUsersLogs: { view: true, create: true, edit: true, delete: true },
        personCountLogs: { view: true, create: true, edit: true, delete: true },
        deskLogs: { view: true, create: true, edit: true, delete: true },
        ANPRLogs: { view: true, create: true, edit: true, delete: true },
        productivityLogs: { view: true, create: true, edit: true, delete: true },
        trackLogs: { view: true, create: true, edit: true, delete: true },
        visibilityLogs: { view: true, create: true, edit: true, delete: true },
        guardLogs: { view: true, create: true, edit: true, delete: true },
        conveyorLogs: { view: true, create: true, edit: true, delete: true },
        vehicleObstructionLogs: { view: true, create: true, edit: true, delete: true },
        vehicleCountLogs: { view: true, create: true, edit: true, delete: true },
        crusherLogs: { view: true, create: true, edit: true, delete: true },
        lineCrossingLogs: { view: true, create: true, edit: true, delete: true },
        waterSpillLogs: { view: true, create: true, edit: true, delete: true },
        unauthorizedAccessLogs: { view: true, create: true, edit: true, delete: true },
        carLogs: { view: true, create: true, edit: true, delete: true }
    },
    locations: { view: true, create: true, edit: true, delete: true },
    playbacks: { view: true, create: true, edit: true, delete: true },

};

export let readConfig = {
    NVR: { view: true, create: false, edit: false, delete: false },
    channels: { view: true, create: false, edit: false, delete: false },
    LIVE: { view: true, create: false, edit: false, delete: false },
    dashboard: { view: true, create: false, edit: false, delete: false },
    alerts: { view: true, create: false, edit: false, delete: false },
    analytics: { view: true, create: false, edit: false, delete: false },
    incidents: { view: true, create: false, edit: false, delete: false },
    Users: { view: true, create: false, edit: false, delete: false },
    permission: { view: true, create: false, edit: false, delete: false },
    roles: { view: true, create: false, edit: false, delete: false },
    settings: { view: true, create: false, edit: false, delete: false },
    departments: { view: true, create: false, edit: false, delete: false },
    detectionSettings: { view: true, create: false, edit: false, delete: false },
    profiles: { view: true, create: false, edit: false, delete: false },
    recipients: { view: true, create: false, edit: false, delete: false },
    autoEmailReports: { view: true, create: false, edit: false, delete: false },
    logs: {
        global: { view: true, create: false, edit: false, delete: false },
        accessLogs: { view: true, create: false, edit: false, delete: false },
        attendanceLogs: { view: true, create: false, edit: false, delete: false },
        taggedUsersLogs: { view: true, create: false, edit: false, delete: false },
        detectedUsersLogs: { view: true, create: false, edit: false, delete: false },
        personCountLogs: { view: true, create: false, edit: false, delete: false },
        deskLogs: { view: true, create: false, edit: false, delete: false },
        ANPRLogs: { view: true, create: false, edit: false, delete: false },
        productivityLogs: { view: true, create: false, edit: false, delete: false },
        trackLogs: { view: true, create: false, edit: false, delete: false },
        visibilityLogs: { view: true, create: false, edit: false, delete: false },
        guardLogs: { view: true, create: false, edit: false, delete: false },
        conveyorLogs: { view: true, create: false, edit: false, delete: false },
        vehicleObstructionLogs: { view: true, create: false, edit: false, delete: false },
        vehicleCountLogs: { view: true, create: false, edit: false, delete: false },
        crusherLogs: { view: true, create: false, edit: false, delete: false },
        lineCrossingLogs: { view: true, create: false, edit: false, delete: false },
        waterSpillLogs: { view: true, create: false, edit: false, delete: false },
        unauthorizedAccessLogs: { view: true, create: false, edit: false, delete: false },
        carLogs: { view: true, create: false, edit: false, delete: false }
    },
    locations: { view: true, create: false, edit: false, delete: false },
    playbacks: { view: true, create: false, edit: false, delete: false }

};

export let writeConfig = {
    NVR: { view: true, create: true, edit: true, delete: false },
    channels: { view: true, create: true, edit: true, delete: false },
    LIVE: { view: true, create: true, edit: true, delete: false },
    dashboard: { view: true, create: true, edit: true, delete: false },
    alerts: { view: true, create: true, edit: true, delete: false },
    analytics: { view: true, create: true, edit: true, delete: false },
    incidents: { view: true, create: true, edit: true, delete: false },
    Users: { view: true, create: true, edit: true, delete: false },
    permission: { view: true, create: true, edit: true, delete: false },
    roles: { view: true, create: true, edit: true, delete: false },
    settings: { view: true, create: true, edit: true, delete: false },
    departments: { view: true, create: true, edit: true, delete: false },
    detectionSettings: { view: true, create: true, edit: true, delete: false },
    profiles: { view: true, create: true, edit: true, delete: false },
    recipients: { view: true, create: true, edit: true, delete: false },
    autoEmailReports: { view: true, create: true, edit: true, delete: false },
    logs: {
        global: { view: true, create: true, edit: true, delete: false },
        accessLogs: { view: true, create: true, edit: true, delete: false },
        attendanceLogs: { view: true, create: true, edit: true, delete: false },
        taggedUsersLogs: { view: true, create: true, edit: true, delete: false },
        detectedUsersLogs: { view: true, create: true, edit: true, delete: false },
        personCountLogs: { view: true, create: true, edit: true, delete: false },
        deskLogs: { view: true, create: true, edit: true, delete: false },
        ANPRLogs: { view: true, create: true, edit: true, delete: false },
        productivityLogs: { view: true, create: true, edit: true, delete: false },
        trackLogs: { view: true, create: true, edit: true, delete: false },
        visibilityLogs: { view: true, create: true, edit: true, delete: false },
        guardLogs: { view: true, create: true, edit: true, delete: false },
        conveyorLogs: { view: true, create: true, edit: true, delete: false },
        vehicleObstructionLogs: { view: true, create: true, edit: true, delete: false },
        vehicleCountLogs: { view: true, create: true, edit: true, delete: false },
        crusherLogs: { view: true, create: true, edit: true, delete: false },
        lineCrossingLogs: { view: true, create: true, edit: true, delete: false },
        waterSpillLogs: { view: true, create: true, edit: true, delete: false },
        unauthorizedAccessLogs: { view: true, create: true, edit: true, delete: false },
        carLogs: { view: true, create: true, edit: true, delete: false }
    },
    locations: { view: true, create: true, edit: true, delete: false },
    playbacks: { view: true, create: true, edit: true, delete: false }
};




/**
 * Canonical definition of the three seeded roles.
 *
 * Single source for BOTH the login-time seeder (v2 Auth.service) and
 * POST /roles/sync-defaults, so that adding a module to the configs above is
 * the only edit needed — new tenants get it at provisioning, existing tenants
 * get it on the next sync, and the two can never disagree.
 *
 * `flags` are the flat view/create/edit/delete columns on the role document.
 * They are display-only — permissionMiddleware enforces against
 * permissionConfig, never these — but they are what the Roles table renders,
 * so they must agree with the config they sit next to. Note `write` carries
 * view:true here: writeConfig grants view on every module, so the role row has
 * to say so ("everything except delete").
 */
export const DEFAULT_ROLE_PRESETS = [
    {
        roleName: "admin",
        config: adminConfig,
        flags: { view: true, create: true, edit: true, delete: true },
        isEmpRole: false,
    },
    {
        roleName: "read",
        config: readConfig,
        flags: { view: true, create: false, edit: false, delete: false },
        isEmpRole: false,
    },
    {
        roleName: "write",
        config: writeConfig,
        flags: { view: true, create: true, edit: true, delete: false },
        isEmpRole: false,
    },
];

/** Deep copy, so a caller can never mutate the shared template literals above. */
export const cloneConfig = (config) => JSON.parse(JSON.stringify(config));

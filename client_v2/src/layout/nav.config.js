import {
  LayoutDashboard,
  Grid2x2,
  Video,
  TriangleAlert,
  ShieldAlert,
  BarChart3,
  ScanFace,
  CalendarCheck,
  DoorOpen,
  Car,
  UserMinus,
  Tags,
  UserCheck,
  Cctv,
  Users,
  Settings,
  MapPin,
  Building2,
  Clock,
  UserPlus,
  ShieldCheck,
  Bell,
  MailPlus,
  Container,
  OctagonAlert,
  CarFront,
  Hammer,
  GitBranch,
  Droplets,
  Ban,
  Activity,
  TrendingUp,
  Eye,
  Moon,
  ScanEye,
  SlidersHorizontal,
  Settings2,
  CirclePlay,
} from 'lucide-react';

// The sidebar group whose order the user can customise (Settings ▸ Log Order).
// Exported so Sidebar.jsx and lib/logOrder.js match on one literal instead of
// each carrying their own copy.
export const LOGS_GROUP_LABEL = 'LOGS & RECORDS';

/**
 * `logsConfigKey` ties a log item to its flag in GET /logs-configuration.
 *
 * That endpoint is the single source of truth for whether a log page shows: it
 * already folds together the admin's stored preference, auto-enable (a log
 * switches on once its detection runs) and the detection licence (an
 * unlicensed detection's log is forced off). The sidebar therefore renders what
 * the server says instead of carrying its own detection→log mapping, which
 * would drift.
 *
 * The key is NOT always the nav key or the permission sub-key — taggedUsers,
 * detectedUsers, deskAbsenceLogs and anprLogs all differ from theirs, which is
 * why this is spelled out per item.
 */

// Mining incident log tabs (conveyor, crusher, etc.).
const stevinrockLogItems = [
  { key: 'conveyor', label: 'Conveyor Logs', path: 'logs/conveyor', icon: Container, permissionKey: 'logs', permissionSubKey: 'conveyorLogs' , logsConfigKey: 'conveyorLogs' },
  { key: 'vehicle-obstruction', label: 'Vehicle Obstruction Logs', path: 'logs/vehicle-obstruction', icon: OctagonAlert, permissionKey: 'logs', permissionSubKey: 'vehicleObstructionLogs' , logsConfigKey: 'vehicleObstructionLogs' },
  { key: 'vehicle-count', label: 'Vehicle Count Logs', path: 'logs/vehicle-count', icon: CarFront, permissionKey: 'logs', permissionSubKey: 'vehicleCountLogs' , logsConfigKey: 'vehicleCountLogs' },
  { key: 'car', label: 'Car Logs', path: 'logs/car', icon: Car, permissionKey: 'logs', permissionSubKey: 'carLogs' , logsConfigKey: 'carLogs' },
  { key: 'crusher', label: 'Crusher Logs', path: 'logs/crusher', icon: Hammer, permissionKey: 'logs', permissionSubKey: 'crusherLogs' , logsConfigKey: 'crusherLogs' },
  { key: 'line-crossing', label: 'Line Crossing Logs', path: 'logs/line-crossing', icon: GitBranch, permissionKey: 'logs', permissionSubKey: 'lineCrossingLogs' , logsConfigKey: 'lineCrossingLogs' },
  { key: 'water-spill', label: 'Water Spill Logs', path: 'logs/water-spill', icon: Droplets, permissionKey: 'logs', permissionSubKey: 'waterSpillLogs' , logsConfigKey: 'waterSpillLogs' },
  { key: 'unauthorized-access', label: 'Unauthorized Access Logs', path: 'logs/unauthorized-access', icon: Ban, permissionKey: 'logs', permissionSubKey: 'unauthorizedAccessLogs' , logsConfigKey: 'unauthorizedAccessLogs' },
];

/**
 * V2 navigation grouped exactly as the prototype sidebar
 * (MONITOR / INTELLIGENCE / LOGS & RECORDS / CONFIGURE / ADMINISTER).
 * `path` is relative to the /v2 mount; `key` matches the prototype view id.
 */
// `permissionKey` maps each item to its module in the permission matrix
// returned by GET /permissions/user-permissions (same module keys V1 uses —
// see server/core/v1/permission/permissions.config.js). An item with no
// permissionKey is always shown (nothing in V1 gates it either, e.g. Command
// Center/Analytics). Sidebar.jsx hides (not disables) any item whose module
// resolves to view:false, matching V1's Header.jsx nav filtering exactly.
export const NAV_GROUPS = [
  // Live Demo disabled for now.
  // {
  //   label: 'EXPERIENCE',
  //   items: [
  //     { key: 'live-demo', label: 'Live Demo', path: 'live-demo', icon: CirclePlay, badge: 'NEW' },
  //   ],
  // },
  {
    label: 'MONITOR',
    items: [
      { key: 'overview', label: 'Command Center', path: 'dashboard', icon: LayoutDashboard, end: true, permissionKey: 'dashboard' },
      { key: 'wall', label: 'Live Wall', path: 'live', icon: Grid2x2, permissionKey: 'LIVE' },
      { key: 'camera', label: 'Playback', path: 'playback', icon: Video, permissionKey: 'playbacks' },
      { key: 'alerts', label: 'Alerts', path: 'alerts', icon: TriangleAlert, badgeKey: 'alerts', permissionKey: 'alerts' },
      { key: 'incidents', label: 'Incident Center', path: 'incidents', icon: ShieldAlert, permissionKey: 'incidents' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { key: 'analytics', label: 'Analytics', path: 'analytics', icon: BarChart3, permissionKey: 'analytics' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    hidden: true,
    items: [
      { key: 'faces', label: 'Face & Watchlist', path: 'faces', icon: ScanFace },
    ],
  },
  {
    label: LOGS_GROUP_LABEL,
    items: [
      { key: 'attendance', label: 'Attendance Logs', path: 'logs/attendance', icon: CalendarCheck, permissionKey: 'logs', permissionSubKey: 'attendanceLogs' , logsConfigKey: 'attendanceLogs' },
      { key: 'access', label: 'Access Logs', path: 'logs/access', icon: DoorOpen, permissionKey: 'logs', permissionSubKey: 'accessLogs' , logsConfigKey: 'accessLogs' },
      { key: 'tagged-users', label: 'Tagged Users', path: 'logs/tagged-users', icon: Tags, permissionKey: 'logs', permissionSubKey: 'taggedUsersLogs' , logsConfigKey: 'taggedUsers' },
      { key: 'detected-users', label: 'Detected Users', path: 'logs/detected-users', icon: ScanFace, permissionKey: 'logs', permissionSubKey: 'detectedUsersLogs' , logsConfigKey: 'detectedUsers' },
      { key: 'person-count', label: 'Person Count Logs', path: 'logs/person-count', icon: UserCheck, permissionKey: 'logs', permissionSubKey: 'personCountLogs' , logsConfigKey: 'personCountLogs' },
      { key: 'desk-absence', label: 'Desk Absence Logs', path: 'logs/desk-absence', icon: UserMinus, permissionKey: 'logs', permissionSubKey: 'deskLogs' , logsConfigKey: 'deskAbsenceLogs' },
      { key: 'anpr', label: 'ANPR Logs', path: 'logs/anpr', icon: Car, permissionKey: 'logs', permissionSubKey: 'ANPRLogs' , logsConfigKey: 'anprLogs' },
      // { key: 'productivity', label: 'Productivity Logs', path: 'logs/productivity', icon: TrendingUp },
      // Hidden from the sidebar, and from the header search with it — Header.jsx
      // builds its PAGE_INDEX from NAV_GROUPS, so an item that isn't listed here
      // isn't searchable either. The routes stay live in routes.jsx (as they do
      // for Productivity Logs above), so a direct URL still reaches the page.
      // { key: 'track', label: 'Track Logs', path: 'logs/track', icon: Activity, permissionKey: 'logs', permissionSubKey: 'trackLogs' , logsConfigKey: 'trackLogs' },
      // { key: 'visibility', label: 'Visibility Logs', path: 'logs/visibility', icon: Eye, permissionKey: 'logs', permissionSubKey: 'visibilityLogs' , logsConfigKey: 'visibilityLogs' },
      // { key: 'guard', label: 'Guard Logs', path: 'logs/guard', icon: Shield, permissionKey: 'logs', permissionSubKey: 'guardLogs' , logsConfigKey: 'guardLogs' },
      // Sleep Activity Logs — permission-gated (logs.sleepActivityLogs). The
      // route in routes.jsx stays live so a direct URL still reaches the page.
      // A logsConfigKey can be added once GET /logs-configuration exposes one.
      { key: 'sleep-activity', label: 'Sleep Activity Logs', path: 'logs/sleep-activity', icon: Moon, permissionKey: 'logs', permissionSubKey: 'sleepActivityLogs' },
      // Mining incident logs — shown for every client.
      ...stevinrockLogItems,
    ],
  },
  {
    label: 'CONFIGURE',
    items: [
      { key: 'cameras', label: 'Cameras & NVRs', path: 'cameras', icon: Cctv, permissionKey: 'NVR' },
      { key: 'detection-settings', label: 'Detections', path: 'detection-settings', icon: Settings2, permissionKey: 'detectionSettings' },
    ],
  },
  {
    label: 'ADMINISTER',
    items: [
      { key: 'users', label: 'User Role Detail', path: 'users', icon: Users, permissionKey: 'Users' },
      { key: 'settings', label: 'Settings', path: 'settings', icon: Settings, permissionKey: 'settings' },
      { key: 'roles', label: 'Roles & Permission', path: 'roles', icon: ShieldCheck, permissionKey: 'roles' },
      { key: 'locations', label: 'Locations', path: 'locations', icon: MapPin, permissionKey: 'locations' },
      { key: 'departments', label: 'Departments', path: 'departments', icon: Building2, permissionKey: 'departments' },
      { key: 'shifts', label: 'Shift Management', path: 'shifts', icon: Clock, permissionKey: 'shifts' },
      { key: 'register', label: 'Register your User', path: 'register-users', icon: UserPlus, permissionKey: 'Users' },
    ],
  },
  {
    label: 'SETTINGS',
    items: [
      // { key: 'engines', label: 'Detection Settings', path: 'engines', icon: SlidersHorizontal, permissionKey: 'detectionSettings' },
      { key: 'recipients', label: 'Alert Recipients', path: 'recipients', icon: Bell, permissionKey: 'recipients' },
      { key: 'auto-email-reports', label: 'Auto Email Reports', path: 'auto-email-reports', icon: MailPlus, permissionKey: 'autoEmailReports' },
    ],
  },
];

/** Title + subtitle shown in the header per view (ported from the prototype). */
export const VIEW_META = {
  overview: { title: 'Command Center', sub: 'Real-time intelligence across all sites' },
  wall: { title: 'Live Video Wall', sub: 'Multi-camera monitoring grid' },
  'live-demo': { title: 'Live Demo', sub: 'Upload a clip, pick a detection, watch VideoraIQ work' },
  camera: { title: 'Playback', sub: 'Recorded footage · scrub, seek & review events' },
  alerts: { title: 'Alerts & Events', sub: 'Investigate and respond to detections' },
  incidents: { title: 'Incident Center', sub: 'Visual evidence grid across all detections' },
  analytics: { title: 'Analytics', sub: 'Trends, heatmaps & engine performance' },
  'email-monitoring': { title: 'Email Monitoring', sub: 'SMTP traffic, delivery health & queue status' },
  assistant: { title: 'AI Assistant', sub: 'Ask questions about your live operational data' },
  faces: { title: 'Face Recognition & Watchlist', sub: 'Identity verification & attendance' },
  cameras: { title: 'Cameras & NVRs', sub: 'Device inventory & recorder health' },
  'camera-settings': { title: 'Camera Settings', sub: 'Camera alias names & department assignment' },
  'detection-settings': { title: 'Detections', sub: 'AI detections - configure & investigate incidents' },
  detections: { title: 'Detections', sub: 'AI detections — configure & investigate incidents' },
  engines: { title: 'Detection Settings', sub: 'Configure detection types per camera' },
  attendance: { title: 'Attendance Logs', sub: 'Face-recognition check-in & working hours' },
  access: { title: 'Access Logs', sub: 'Door & zone entry audit trail' },
  'tagged-users': { title: 'Tagged Users', sub: 'Manually tagged identity matches' },
  'detected-users': { title: 'Detected Users', sub: 'Review, delete & tag detected face folders' },
  'person-count': { title: 'Person Count Logs', sub: 'Zone occupancy & headcount over time' },
  anpr: { title: 'ANPR / Vehicle Logs', sub: 'Vehicle entry / exit & plate matches' },
  'desk-absence': { title: 'Desk Absence Logs', sub: 'Post & seat absence detections' },
  // productivity: { title: 'Productivity Logs', sub: 'Productive vs. non-productive hours by employee' },
  track: { title: 'Track Logs', sub: 'Live user & vehicle activity tracking' },
  visibility: { title: 'Visibility Logs', sub: 'Per-channel presence/absence timeline' },
  guard: { title: 'Guard Logs', sub: 'Guard presence/absence timeline & export' },
  'sleep-activity': { title: 'Sleep Activity Logs', sub: 'Sleeping / awake detection events' },
  conveyor: { title: 'Conveyor Logs', sub: 'Conveyor load / running-state detections' },
  'vehicle-obstruction': { title: 'Vehicle Obstruction Logs', sub: 'Blocked-path & obstruction detections' },
  'vehicle-count': { title: 'Vehicle Count Logs', sub: 'Vehicle throughput over time' },
  car: { title: 'Car Logs', sub: 'Detected vehicle model and year records' },
  crusher: { title: 'Crusher Logs', sub: 'Crusher operating-state detections' },
  'line-crossing': { title: 'Line Crossing Logs', sub: 'Boundary & line-crossing detections' },
  'water-spill': { title: 'Water Spill Logs', sub: 'Water spillage detections' },
  'unauthorized-access': { title: 'Unauthorized Access Logs', sub: 'Restricted-zone entry detections' },
  users: { title: 'User Role Detail', sub: 'Manage users and their assigned roles' },
  roles: { title: 'Roles & Permission', sub: 'Define roles and per-module access' },
  recipients: { title: 'Alert Recipients', sub: 'Who gets notified for each detection type' },
  'auto-email-reports': { title: 'Auto Email Reports', sub: 'Schedule attendance logs for verified recipients' },
  settings: { title: 'Settings', sub: 'Platform, alerts, privacy and integrations' },
  profile: { title: 'My Profile', sub: 'Your account, activity & preferences' },
  'admin-profile': { title: 'Detection Profile', sub: 'Your account and detection configuration' },
  locations: { title: 'Locations', sub: 'Locations' },
  departments: { title: 'Departments', sub: 'Departments ' },
  locations: { title: 'Locations', sub: 'Manage organization locations' },
  departments: { title: 'Departments', sub: 'Manage departments and teams' },
  shifts: { title: 'Shift Management', sub: 'Shift rules, working days & staff assignment' },
  'register-users': { title: 'Register your User', sub: 'Create a new employee profile and capture enrollment images' },
};



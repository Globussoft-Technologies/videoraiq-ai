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
  UserPlus,
  ShieldCheck,
  Bell,
} from 'lucide-react';

/**
 * V2 navigation grouped exactly as the prototype sidebar
 * (MONITOR / INTELLIGENCE / LOGS & RECORDS / CONFIGURE / ADMINISTER).
 * `path` is relative to the /v2 mount; `key` matches the prototype view id.
 */
export const NAV_GROUPS = [
  {
    label: 'MONITOR',
    items: [
      { key: 'overview', label: 'Command Center', path: 'dashboard', icon: LayoutDashboard, end: true },
      { key: 'wall', label: 'Live Wall', path: 'live', icon: Grid2x2 },
      { key: 'camera', label: 'Playback', path: 'camera', icon: Video },
      { key: 'alerts', label: 'Alerts', path: 'alerts', icon: TriangleAlert, badgeKey: 'alerts' },
      { key: 'incidents', label: 'Incident Center', path: 'incidents', icon: ShieldAlert },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { key: 'analytics', label: 'Analytics', path: 'analytics', icon: BarChart3 },
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
    label: 'LOGS & RECORDS',
    items: [
      { key: 'attendance', label: 'Attendance Logs', path: 'logs/attendance', icon: CalendarCheck },
      { key: 'access', label: 'Access Logs', path: 'logs/access', icon: DoorOpen },
      { key: 'tagged-users', label: 'Tagged Users', path: 'logs/tagged-users', icon: Tags },
      // { key: 'person-count', label: 'Person Count Logs', path: 'logs/person-count', icon: UserCheck },
      // { key: 'absence', label: 'Desk Absence Logs', path: 'logs/absence', icon: UserMinus },
      { key: 'anpr', label: 'ANPR Logs', path: 'logs/anpr', icon: Car },
    ],
  },
  {
    label: 'CONFIGURE',
    items: [
      { key: 'cameras', label: 'Cameras & NVRs', path: 'cameras', icon: Cctv },
    ],
  },
  {
    label: 'USER DETAILS',
    items: [
      { key: 'users', label: 'User Role Detail', path: 'users', icon: Users },
      { key: 'roles', label: 'Roles & Permission', path: 'roles', icon: ShieldCheck },
      { key: 'locations', label: 'Locations', path: 'locations', icon: MapPin },
      { key: 'departments', label: 'Departments', path: 'departments', icon: Building2 },
      { key: 'register', label: 'Register your User', path: 'register-users', icon: UserPlus },
    ],
  },
  {
    label: 'SETTINGS',
    items: [
      { key: 'engines', label: 'Detection Settings', path: 'engines', icon: Settings },
      { key: 'recipients', label: 'Alert Recipients', path: 'recipients', icon: Bell },
    ],
  },
];

/** Title + subtitle shown in the header per view (ported from the prototype). */
export const VIEW_META = {
  overview: { title: 'Command Center', sub: 'Real-time intelligence across all sites' },
  wall: { title: 'Live Video Wall', sub: 'Multi-camera monitoring grid' },
  camera: { title: 'Playback', sub: 'Recorded footage · scrub, seek & review events' },
  alerts: { title: 'Alerts & Events', sub: 'Investigate and respond to detections' },
  incidents: { title: 'Incident Center', sub: 'Visual evidence grid across all detections' },
  analytics: { title: 'Analytics', sub: 'Trends, heatmaps & engine performance' },
  faces: { title: 'Face Recognition & Watchlist', sub: 'Identity verification & attendance' },
  cameras: { title: 'Cameras & NVRs', sub: 'Device inventory & recorder health' },
  engines: { title: 'Detection Settings', sub: 'Configure detection types per camera' },
  attendance: { title: 'Attendance Logs', sub: 'Face-recognition check-in & working hours' },
  access: { title: 'Access Logs', sub: 'Door & zone entry audit trail' },
  'tagged-users': { title: 'Tagged Users', sub: 'Manually tagged identity matches' },
  'person-count': { title: 'Person Count Logs', sub: 'Zone occupancy & headcount over time' },
  anpr: { title: 'ANPR / Vehicle Logs', sub: 'Vehicle entry / exit & plate matches' },
  absence: { title: 'Desk Absence Logs', sub: 'Post & seat absence detections' },
  users: { title: 'User Role Detail', sub: 'Manage users and their assigned roles' },
  roles: { title: 'Roles & Permission', sub: 'Define roles and per-module access' },
  recipients: { title: 'Alert Recipients', sub: 'Who gets notified for each detection type' },
  settings: { title: 'Settings', sub: 'Platform, alerts, privacy & integrations' },
  profile: { title: 'My Profile', sub: 'Your account, activity & preferences' },
  locations: { title: 'Locations', sub: 'Locations' },
  departments: { title: 'Departments', sub: 'Departments ' },
  locations: { title: 'Locations', sub: 'Manage organization locations' },
  departments: { title: 'Departments', sub: 'Manage departments and teams' },
  'register-users': { title: 'Register your User', sub: 'Create a new employee profile and capture enrollment images' },
};

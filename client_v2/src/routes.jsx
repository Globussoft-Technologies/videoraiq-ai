import { Route } from 'react-router-dom';
import V2Layout from './layout/V2Layout';
import HomeRedirect from './layout/HomeRedirect';
import RequirePermission from './layout/RequirePermission';
import CommandCenter from './page/user/CommandCenter/CommandCenter';
import IncidentCenter from './page/user/Incidents/IncidentCenter';
import Analytics from './page/user/Analytics/Analytics';
import AlertsView from './page/user/Alerts/AlertsView';
import CameraView from './page/user/CameraView/CameraView';
import LiveWall from './page/user/LiveWall/LiveWall';
import NVRCameras from './page/user/Configure/NVRCameras';
import CameraSettings from './page/user/Configure/CameraSettings';
import DetectionSettings from './page/user/Configure/DetectionSettings';
import UsersPage from './page/user/Administer/UsersPage';
import SystemSettings from './page/user/Administer/SystemSettings';
import AlertRecipients from './page/user/Administer/AlertRecipients';
import Placeholder from './page/user/Administer/Placeholder';
import Departments from './page/user/Departments/Departments';
import Locations from './page/user/Locations/Locations';
import RolesPermission from './page/user/RolesPermission/RolesPermission';
import AddProfile from './pages/RegisterUser/AddProfile';
import MyProfile from './pages/MyProfile/MyProfile';
import AttendanceLogs from './pages/AttendanceLogs/AttendanceLogs';
import AccessLogs from './pages/AccessLogs/AccessLogs';
import TaggedUsers from './pages/TaggedUsers/TaggedUsers';
import DetectedUsers from './pages/DetectedUsers/DetectedUsers';
import PersonCountLogs from './pages/PersonCountLogs/PersonCountLogs';
import DeskAbsenceLogs from './pages/DeskAbsenceLogs/DeskAbsenceLogs';
import ANPRLogs from './pages/ANPRLogs/ANPRLogs';
import VehicleCountLogs from './pages/VehicleCountLogs/VehicleCountLogs';
import ConveyorLogs from './pages/ConveyorLogs/ConveyorLogs';
import VehicleObstructionLogs from './pages/VehicleObstructionLogs/VehicleObstructionLogs';
import CrusherLogs from './pages/CrusherLogs/CrusherLogs';
import LineCrossingLogs from './pages/LineCrossingLogs/LineCrossingLogs';
import WaterSpillLogs from './pages/WaterSpillLogs/WaterSpillLogs';
import UnauthorizedAccessLogs from './pages/UnauthorizedAccessLogs/UnauthorizedAccessLogs';
import ProductivityLog from './pages/ProductivityLog/ProductivityLog';
import TrackLog from './pages/TrackLog/TrackLog';
import VisibilityLog from './pages/VisibilityLog/VisibilityLog';
import GuardLog from './pages/GuardLog/GuardLog';

const STUBS = [
  ['faces', 'faces', '/logs/tagged-users'],
];

// Wraps a route's element in the permission gate matching its nav.config.js
// entry — kept as explicit per-route calls (rather than generated from
// NAV_GROUPS) so each route's guard is visible and auditable right where the
// route itself is declared.
const guard = (permissionKey, permissionSubKey, element) => (
  <RequirePermission permissionKey={permissionKey} permissionSubKey={permissionSubKey}>
    {element}
  </RequirePermission>
);

export const v2Routes = (
  <Route element={<V2Layout />}>
    <Route index element={<HomeRedirect />} />
    <Route path="dashboard" element={guard('dashboard', undefined, <CommandCenter />)} />
    <Route path="live" element={guard('LIVE', undefined, <LiveWall />)} />
    <Route path="playback" element={guard('playbacks', undefined, <CameraView />)} />
    <Route path="alerts" element={guard('alerts', undefined, <AlertsView />)} />
    <Route path="incidents" element={guard('incidents', undefined, <IncidentCenter />)} />
    <Route path="analytics" element={guard('analytics', undefined, <Analytics />)} />
    <Route path="roles" element={guard('roles', undefined, <RolesPermission />)} />
    <Route path="locations" element={guard('locations', undefined, <Locations />)} />
    <Route path="departments" element={guard('departments', undefined, <Departments />)} />
    <Route path="register-users" element={guard('Users', undefined, <AddProfile />)} />
    <Route path="profile" element={<MyProfile />} />
    {/* Logs & Records (nested under /logs/*) */}
    <Route path="logs/attendance" element={guard('logs', 'attendanceLogs', <AttendanceLogs />)} />
    <Route path="logs/access" element={guard('logs', 'accessLogs', <AccessLogs />)} />
    <Route path="logs/tagged-users" element={guard('logs', 'taggedUsersLogs', <TaggedUsers />)} />
    <Route path="logs/detected-users" element={guard('logs', 'detectedUsersLogs', <DetectedUsers />)} />
    <Route path="logs/anpr" element={guard('logs', 'ANPRLogs', <ANPRLogs />)} />
    <Route path="logs/desk-absence" element={guard('logs', 'deskLogs', <DeskAbsenceLogs />)} />
    <Route path="logs/person-count" element={guard('logs', 'personCountLogs', <PersonCountLogs />)} />
    <Route path="logs/productivity" element={<ProductivityLog />} />
    <Route path="logs/track" element={guard('logs', 'trackLogs', <TrackLog />)} />
    <Route path="logs/visibility" element={guard('logs', 'visibilityLogs', <VisibilityLog />)} />
    <Route path="logs/guard" element={guard('logs', 'guardLogs', <GuardLog />)} />

    {/* Stevinrock incident logs — each is a thin component wrapping the shared
        IncidentLogsPage with its config; Vehicle Count is a chart page. */}
    <Route path="logs/conveyor" element={guard('logs', 'conveyorLogs', <ConveyorLogs />)} />
    <Route path="logs/vehicle-obstruction" element={guard('logs', 'vehicleObstructionLogs', <VehicleObstructionLogs />)} />
    <Route path="logs/vehicle-count" element={guard('logs', 'vehicleCountLogs', <VehicleCountLogs />)} />
    <Route path="logs/crusher" element={guard('logs', 'crusherLogs', <CrusherLogs />)} />
    <Route path="logs/line-crossing" element={guard('logs', 'lineCrossingLogs', <LineCrossingLogs />)} />
    <Route path="logs/water-spill" element={guard('logs', 'waterSpillLogs', <WaterSpillLogs />)} />
    <Route path="logs/unauthorized-access" element={guard('logs', 'unauthorizedAccessLogs', <UnauthorizedAccessLogs />)} />

    {/* Configure */}
    <Route path="cameras" element={guard('NVR', undefined, <NVRCameras />)} />
    <Route path="camera-settings" element={<CameraSettings />} />
    <Route path="engines" element={guard('detectionSettings', undefined, <DetectionSettings />)} />
    <Route path="recipients" element={guard('recipients', undefined, <AlertRecipients />)} />
    {/* Administer */}
    <Route path="users" element={guard('Users', undefined, <UsersPage />)} />
    <Route path="settings" element={<SystemSettings />} />
    {STUBS.map(([key, path, legacy]) => (
      <Route key={key} path={path} element={<Placeholder viewKey={key} legacyPath={legacy} />} />
    ))}
  </Route>
);

export default v2Routes;

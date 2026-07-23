import { Route, Navigate } from 'react-router-dom';
import V2Layout from './layout/V2Layout';
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
  ['profile', 'profile', '/profile'],
];

export const v2Routes = (
  <Route element={<V2Layout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<CommandCenter />} />
    <Route path="live" element={<LiveWall />} />
    <Route path="playback" element={<CameraView />} />
    <Route path="alerts" element={<AlertsView />} />
    <Route path="incidents" element={<IncidentCenter />} />
    <Route path="analytics" element={<Analytics />} />
    <Route path="roles" element={<RolesPermission />} />
    <Route path="locations" element={<Locations />} />
    <Route path="departments" element={<Departments />} />
    <Route path="register-users" element={<AddProfile />} />
    {/* Logs & Records (nested under /logs/*) */}
    <Route path="logs/attendance" element={<AttendanceLogs />} />
    <Route path="logs/access" element={<AccessLogs />} />
    <Route path="logs/tagged-users" element={<TaggedUsers />} />
    <Route path="logs/detected-users" element={<DetectedUsers />} />
    <Route path="logs/anpr" element={<ANPRLogs />} />
    <Route path="logs/desk-absence" element={<DeskAbsenceLogs />} />
    <Route path="logs/person-count" element={<PersonCountLogs />} />
    <Route path="logs/productivity" element={<ProductivityLog />} />
    <Route path="logs/track" element={<TrackLog />} />
    <Route path="logs/visibility" element={<VisibilityLog />} />
    <Route path="logs/guard" element={<GuardLog />} />

    {/* Stevinrock incident logs — each is a thin component wrapping the shared
        IncidentLogsPage with its config; Vehicle Count is a chart page. */}
    <Route path="logs/conveyor" element={<ConveyorLogs />} />
    <Route path="logs/vehicle-obstruction" element={<VehicleObstructionLogs />} />
    <Route path="logs/vehicle-count" element={<VehicleCountLogs />} />
    <Route path="logs/crusher" element={<CrusherLogs />} />
    <Route path="logs/line-crossing" element={<LineCrossingLogs />} />
    <Route path="logs/water-spill" element={<WaterSpillLogs />} />
    <Route path="logs/unauthorized-access" element={<UnauthorizedAccessLogs />} />

    {/* Configure */}
    <Route path="cameras" element={<NVRCameras />} />
    <Route path="camera-settings" element={<CameraSettings />} />
    <Route path="engines" element={<DetectionSettings />} />
    <Route path="recipients" element={<AlertRecipients />} />
    {/* Administer */}
    <Route path="users" element={<UsersPage />} />
    <Route path="settings" element={<SystemSettings />} />  
    {STUBS.map(([key, path, legacy]) => (
      <Route key={key} path={path} element={<Placeholder viewKey={key} legacyPath={legacy} />} />
    ))}
  </Route>
);

export default v2Routes;

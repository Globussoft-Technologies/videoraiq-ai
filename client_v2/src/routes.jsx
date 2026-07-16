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

const STUBS = [
  ['faces', 'faces', '/logs/tagged-users'],
  ['profile', 'profile', '/profile'],
];

export const v2Routes = (
  <Route element={<V2Layout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<CommandCenter />} />
    <Route path="live" element={<LiveWall />} />
    <Route path="camera" element={<CameraView />} />
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

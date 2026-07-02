import { Route } from 'react-router-dom';
import V2Layout from './layout/V2Layout';
import CommandCenter from './page/user/CommandCenter/CommandCenter';
import IncidentCenter from './page/user/Incidents/IncidentCenter';
import AlertsView from './page/user/Alerts/AlertsView';
import CameraView from './page/user/CameraView/CameraView';
import LiveWall from './page/user/LiveWall/LiveWall';
import NVRCameras from './page/user/Configure/NVRCameras';
import DetectionSettings from './page/user/Configure/DetectionSettings';
import UsersPage from './page/user/Administer/UsersPage';
import SystemSettings from './page/user/Administer/SystemSettings';
import Placeholder from './page/user/Administer/Placeholder';
import Departments from './page/user/Departments/Departments';
import Locations from './page/user/Locations/Locations';
import AddProfile from './pages/RegisterUser/AddProfile';
import AttendanceLogs from './pages/AttendanceLogs/AttendanceLogs';
import AccessLogs from './pages/AccessLogs/AccessLogs';
import TaggedUsers from './pages/TaggedUsers/TaggedUsers';
import PersonCountLogs from './pages/PersonCountLogs/PersonCountLogs';
import DeskAbsenceLogs from './pages/DeskAbsenceLogs/DeskAbsenceLogs';
import ANPRLogs from './pages/ANPRLogs/ANPRLogs';

const STUBS = [
  ['analytics', 'analytics', '/dashboard'],
  ['faces', 'faces', '/logs/tagged-users'],
  ['profile', 'profile', '/profile'],
];

export const v2Routes = (
  <Route path="v2" element={<V2Layout />}>
    <Route index element={<CommandCenter />} />
    <Route path="wall" element={<LiveWall />} />
    <Route path="camera" element={<CameraView />} />
    <Route path="alerts" element={<AlertsView />} />
    <Route path="incidents" element={<IncidentCenter />} />
    <Route path="locations" element={<Locations />} />
    <Route path="departments" element={<Departments />} />
    <Route path="register-users" element={<AddProfile />} />
    {/* Logs & Records (nested under /v2/logs/*) */}
    <Route path="logs/attendance" element={<AttendanceLogs />} />
    {/* <Route path="logs/access" element={<AccessLogs />} />
    <Route path="logs/tagged-users" element={<TaggedUsers />} />
    <Route path="logs/person-count" element={<PersonCountLogs />} />
    <Route path="logs/absence" element={<DeskAbsenceLogs />} />
    <Route path="logs/anpr" element={<ANPRLogs />} /> */}

    {/* Configure */}
    <Route path="cameras" element={<NVRCameras />} />
    <Route path="engines" element={<DetectionSettings />} />
    {/* Administer */}
    <Route path="users" element={<UsersPage />} />
    <Route path="settings" element={<SystemSettings />} />
    {STUBS.map(([key, path, legacy]) => (
      <Route key={key} path={path} element={<Placeholder viewKey={key} legacyPath={legacy} />} />
    ))}
  </Route>
);

export default v2Routes;

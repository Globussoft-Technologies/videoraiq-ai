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

const STUBS = [
  ['analytics', 'analytics', '/dashboard'],
  ['faces', 'faces', '/logs/tagged-users'],
  ['attendance', 'attendance', '/logs/attendance'],
  ['access', 'access', '/logs/access'],
  ['anpr', 'anpr', '/logs/ANPR'],
  ['absence', 'absence', '/logs/desk-absence'],
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

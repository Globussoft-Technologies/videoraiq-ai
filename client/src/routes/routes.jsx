import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from 'react-router-dom';
// import PrivateRoute from 'auth/PrivateRoute';
import { Layout } from '../layout/Layout';
import Dashboard from '@/page/user/Dashboard/Dashboard';
import Incidents from '@/page/user/Incidents/Incidents';
import Streams from '@/page/user/Streams/Streams';
import Settings from '@/page/user/Settings/Settings';
import AddProfile from '@/helpers/Userregister/addProfile';
import RegisterForm from '@/helpers/Userregister/RegisterForm';

import IsAuth from '@/components/Auth/IsAuth';
import Logout from '@/components/Auth/Logout';
import { NvrAuthCheck } from '@/components/Auth/NvrAuthCheck';
import Nvrsettings from '@/page/user/Streams/Nvrsettings';
import CameraSettings from '@/page/user/Streams/Camerasettings';
import Cameraview from '@/page/user/Streams/Cameraview';
import Playback from '@/page/user/Playback/Playback';
import OtpVerification from '@/page/user/Settings/components/OtpVerification';
import Verify from '@/page/user/Settings/components/Verify';
import DetectionSetting from '@/page/user/Detection/DetectionSetting';
import OldDetectionSetting from '@/page/user/Detection/components/olddetections';
import Innersettings from '@/page/user/Detection/components/Innersettings';
import NotificationRecipients from '@/page/user/NotificationRecipients/NotificationRecipients';
import CriticalAlert from '@/page/user/Dashboard/Alertcards/CriticalAlerts';
import ActiveCamera from '@/page/user/Dashboard/Alertcards/ActiveCamera';
import ChartProvider from '@/context/UserContext/Provider';
import StorageSettings from '@/page/user/Settings/StorageSetting/StorageSettings';
import Profile from '@/page/user/Profile/Profile';
import Logs from '@/page/user/EmployeeLogs/AttendanceLog';
import AccessLogs from '@/page/user/EmployeeLogs/AccessLog';
import ProductivityLog from '@/page/user/EmployeeLogs/ProductivityLog';
import TrackLog from '@/page/user/EmployeeLogs/TrackLog';
import VisibilityLog from '@/page/user/EmployeeLogs/VisibilityLog';
import RolesandPermission from '@/page/user/RolePermissions/RolesandPermission';
import UserDetails from '@/page/user/UserDetails/UserDetails';
import Locations from '@/page/user/Locations/Locations';
import UserForm from "@/page/user/Users/UserForm"
import ForgotPassword from "@/page/user/Users/ForgotPassword"
import ResetPassword from "@/page/user/Users/ResetPassword"
import { DashboardFiltersProvider } from '@/context/UserContext/DashboardFiltersContext';
import AdminLoginForm from "@/page/admin/Login/AdminLoginForm"
import EmployeeRegister from "@/page/user/Users/EmployeeRegister"
import GuardLog from '@/page/user/EmployeeLogs/GuardLog';
import CrusherLogs from '@/page/user/EmployeeLogs/CrusherLogs';
import ConveyorLogs from '@/page/user/EmployeeLogs/ConveyorLogs';
import VehicleObstructionLogs from '@/page/user/EmployeeLogs/VehicleObstructionLogs';
import VehicleCountLogs from '@/page/user/EmployeeLogs/VehicleCountLogs';
import LineCrossingLogs from '@/page/user/EmployeeLogs/LineCrossingLogs';
import Departments from '@/page/user/Departments/Departments';
import WaterSpillageLogs from '@/page/user/EmployeeLogs/WaterSpillageLogs';
import UnauthorizedAccess from '@/page/user/EmployeeLogs/UnauthorizedAccess';
import ANPRLogs from '@/page/user/EmployeeLogs/ANPRLogs';


const { VITE_FRONTEND } = import.meta.env;

export const routes = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path='/user-login' element={<UserForm />} />
      <Route path='/register-employee' element={<EmployeeRegister />} />
      <Route path='/admin-login' element={<AdminLoginForm />} />
      <Route path='/forgot-password' element={<ForgotPassword />} />
      <Route path='/reset-password' element={<ResetPassword />} />
      {/* <Route path="/verified" element={<ThankYouRecipient />} /> */}
      <Route path="verify" element={<Verify />} />
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route
        element={
          <IsAuth>
            <DashboardFiltersProvider>
              <ChartProvider>
                <Layout />
              </ChartProvider>
            </DashboardFiltersProvider>
          </IsAuth>
        }
      >
        <Route
          path="dashboard"
          element={
            <NvrAuthCheck>
              <Dashboard />{' '}
            </NvrAuthCheck>
          }
        />
        <Route path="active-cameras" element={<ActiveCamera />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="nvr-settings" element={<Streams />} />
        <Route
          path="cameraview"
          element={
            <NvrAuthCheck>
              <Cameraview />
            </NvrAuthCheck>
          }
        />
        <Route path="playback" element={<Playback />} />
        <Route path="streams/nvrsettings" element={<Nvrsettings />} />
        <Route
          path="streams/camera-settings"
          element={<CameraSettings />}
        />{' '}
        <Route path="settings" element={<Settings />} />
        <Route path="storage-settings" element={<StorageSettings />} />
        <Route path="detection-settings" element={<DetectionSetting />} />
        <Route path="olddetection-settings" element={<OldDetectionSetting />} />
        <Route path="settings/inner" element={<Innersettings />} />
        <Route path="critical-incidents" element={<CriticalAlert />} />
        <Route path="total-incidents" element={<CriticalAlert />} />
        <Route path="incidents-resolved" element={<CriticalAlert />} />
        <Route
          path="notification-recipients"
          element={<NotificationRecipients />}
        />
        <Route path="otp-verification" element={<OtpVerification />} />
        <Route path="profile" element={<Profile />} />
        <Route path="logs" element={<Navigate to="/logs/attendance" />} />
        <Route path="logs/attendance" element={<Logs />} />
        <Route path="logs/access" element={<AccessLogs />} />
        <Route path="logs/productivity" element={<ProductivityLog />} />
        <Route path="logs/track" element={<TrackLog />} />
        <Route path="logs/desk" element={<VisibilityLog />} />
        <Route path="logs/guard" element={<GuardLog />} />
        <Route path="logs/crusher" element={<CrusherLogs />} />
        <Route path="logs/conveyor" element={<ConveyorLogs />} />
        <Route path="logs/vehicle-obstruction" element={<VehicleObstructionLogs />} />
        <Route path="logs/vehicle-count" element={<VehicleCountLogs />} />
        <Route path="logs/line-crossing" element={<LineCrossingLogs />} />
        <Route path="logs/water-spill" element={<WaterSpillageLogs />} />
         <Route path="logs/unauthorized-access" element={<UnauthorizedAccess />} />
        <Route path="logs/ANPR" element={<ANPRLogs />} />
        <Route path="user-details" element={<UserDetails />} />
        <Route path="locations" element={<Locations />} />
        <Route path="departments" element={<Departments />} />

        <Route path="roles-permissions" element={<RolesandPermission />} />
        <Route path="register-users" element={<AddProfile />} />
        <Route path="register-new-employee" element={<RegisterForm />} />
        {/* <Route path="verify" element={<Verify />} /> */}
      </Route>
      <Route
        path="/logout"
        element={<Logout targetUrl={`${VITE_FRONTEND}/logout`} />}
      />
      {/* ✅ Add this line */}
    </>
  )
);

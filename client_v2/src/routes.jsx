import { lazy } from 'react';
import { Navigate, Route, useLocation } from 'react-router-dom';
import V2Layout from './layout/V2Layout';
import HomeRedirect from './layout/HomeRedirect';
import RequirePermission from './layout/RequirePermission';
// import HygieneAnalytics from './pages/HygieneAnalytics/HygieneAnalytics';
import { ADMIN_STORAGE_UI_ENABLED } from './lib/featureFlags';

const CommandCenter = lazy(() => import('./page/user/CommandCenter/CommandCenter'));
const IncidentCenter = lazy(() => import('./page/user/Incidents/IncidentCenter'));
const Analytics = lazy(() => import('./page/user/Analytics/Analytics'));
const AlertsView = lazy(() => import('./page/user/Alerts/AlertsView'));
const CameraView = lazy(() => import('./page/user/CameraView/CameraView'));
const LiveWall = lazy(() => import('./page/user/LiveWall/LiveWall'));
const NVRCameras = lazy(() => import('./page/user/Configure/NVRCameras'));
const CameraSettings = lazy(() => import('./page/user/Configure/CameraSettings'));
const DetectionSettings = lazy(() => import('./page/user/Configure/DetectionSettings'));
const Detections = lazy(() => import('./page/user/Configure/Detections/Detections'));
const UsersPage = lazy(() => import('./page/user/Administer/UsersPage'));
const SystemSettings = lazy(() => import('./page/user/Administer/SystemSettings'));
const AlertRecipients = lazy(() => import('./page/user/Administer/AlertRecipients'));
const AutoEmailReports = lazy(() => import('./page/user/Administer/AutoEmailReports'));
const Placeholder = lazy(() => import('./page/user/Administer/Placeholder'));
const Departments = lazy(() => import('./page/user/Departments/Departments'));
const Shifts = lazy(() => import('./page/user/Shifts/Shifts'));
const ShiftSchedule = lazy(() => import('./page/user/ShiftSchedule/ShiftSchedule'));
const Locations = lazy(() => import('./page/user/Locations/Locations'));
const RolesPermission = lazy(() => import('./page/user/RolesPermission/RolesPermission'));
const AddProfile = lazy(() => import('./pages/RegisterUser/AddProfile'));
const MyProfile = lazy(() => import('./pages/MyProfile/MyProfile'));
const AdminProfile = lazy(() => import('./pages/MyProfile/AdminProfile'));
const ApiKeys = lazy(() => import('./pages/ApiKeys/ApiKeys'));
const AttendanceLogs = lazy(() => import('./pages/AttendanceLogs/AttendanceLogs'));
const AccessLogs = lazy(() => import('./pages/AccessLogs/AccessLogs'));
const TaggedUsers = lazy(() => import('./pages/TaggedUsers/TaggedUsers'));
const DetectedUsers = lazy(() => import('./pages/DetectedUsers/DetectedUsers'));
const PersonCountLogs = lazy(() => import('./pages/PersonCountLogs/PersonCountLogs'));
const DeskAbsenceLogs = lazy(() => import('./pages/DeskAbsenceLogs/DeskAbsenceLogs'));
const ANPRLogs = lazy(() => import('./pages/ANPRLogs/ANPRLogs'));
const VehicleCountLogs = lazy(() => import('./pages/VehicleCountLogs/VehicleCountLogs'));
const CarLogs = lazy(() => import('./pages/CarLogs/CarLogs'));
const VehicleCheckInOutLogs = lazy(() => import('./pages/VehicleCheckInOutLogs/VehicleCheckInOutLogs'));
const ConveyorLogs = lazy(() => import('./pages/ConveyorLogs/ConveyorLogs'));
const VehicleObstructionLogs = lazy(() => import('./pages/VehicleObstructionLogs/VehicleObstructionLogs'));
const UnauthorizedParkingLogs = lazy(() => import('./pages/UnauthorizedParkingLogs/UnauthorizedParkingLogs'));
const CrusherLogs = lazy(() => import('./pages/CrusherLogs/CrusherLogs'));
const CylinderLogs = lazy(() => import('./pages/CylinderLogs/CylinderLogs'));
const LineCrossingLogs = lazy(() => import('./pages/LineCrossingLogs/LineCrossingLogs'));
const WaterSpillLogs = lazy(() => import('./pages/WaterSpillLogs/WaterSpillLogs'));
const UnauthorizedAccessLogs = lazy(() => import('./pages/UnauthorizedAccessLogs/UnauthorizedAccessLogs'));
const FireSmokeLogs = lazy(() => import('./pages/FireSmokeLogs/FireSmokeLogs'));
const PersonFallSickLogs = lazy(() => import('./pages/PersonFallSickLogs/PersonFallSickLogs'));
const WorkingAtHeightLogs = lazy(() => import('./pages/WorkingAtHeightLogs/WorkingAtHeightLogs'));
const OilLeakageLogs = lazy(() => import('./pages/OilLeakageLogs/OilLeakageLogs'));
const EquipmentOilLeakageLogs = lazy(() => import('./pages/EquipmentOilLeakageLogs/EquipmentOilLeakageLogs'));
const VehicleFuelOilLeakageLogs = lazy(() => import('./pages/VehicleFuelOilLeakageLogs/VehicleFuelOilLeakageLogs'));
const WrongLocationLogs = lazy(() => import('./pages/WrongLocationLogs/WrongLocationLogs'));
const WasteDisposalLogs = lazy(() => import('./pages/WasteDisposalLogs/WasteDisposalLogs'));
const AnimalEntryLogs = lazy(() => import('./pages/AnimalEntryLogs/AnimalEntryLogs'));
const MessyAreaLogs = lazy(() => import('./pages/MessyAreaLogs/MessyAreaLogs'));
const BoxPackingLogs = lazy(() => import('./pages/BoxPackingLogs/BoxPackingLogs'));
const StockCountingLogs = lazy(() => import('./pages/StockCountingLogs/StockCountingLogs'));
const StockCountingAnalytics = lazy(() => import('./pages/StockCountingAnalytics/StockCountingAnalytics'));
const BlurredCameraLogs = lazy(() => import('./pages/BlurredCameraLogs/BlurredCameraLogs'));
const DoorDetectionLogs = lazy(() => import('./pages/DoorDetectionLogs/DoorDetectionLogs'));
const SolderLine = lazy(() => import('./pages/SolderLine/SolderLine'));
const HygieneLogs = lazy(() => import('./pages/HygieneLogs/HygieneLogs'));
const ProductivityLog = lazy(() => import('./pages/ProductivityLog/ProductivityLog'));
const TrackLog = lazy(() => import('./pages/TrackLog/TrackLog'));
const VisibilityLog = lazy(() => import('./pages/VisibilityLog/VisibilityLog'));
const GuardLog = lazy(() => import('./pages/GuardLog/GuardLog'));
const SleepActivityLogs = lazy(() => import('./pages/SleepActivityLogs/SleepActivityLogs'));
const MeasurementLogs = lazy(() => import('./pages/MeasurementLogs/MeasurementLogs'));
const EmailMonitoringDashboard = lazy(() => import('./page/user/EmailMonitoring/EmailMonitoringDashboard'));
const AssistantPage = lazy(() => import('./page/user/Assistant/AssistantPage'));
const RaspberryPiDevices = lazy(() => import('./page/user/Administer/RaspberryPiDevices'));
const StorageSettings = lazy(() => import('./page/user/Administer/StorageSettings'));
const MeasurementCalibration = lazy(() => import('./page/user/Configure/MeasurementCalibration'));

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

function SolderLineRoute() {
  const { pathname } = useLocation();
  const modulePageKey = pathname.startsWith('/solder-line/reports')
    ? 'operatorReports'
    : pathname.startsWith('/solder-line/logs')
      ? 'solderAlertLogs'
      : 'solderLine';
  return (
    <RequirePermission permissionKey="logs" permissionSubKey="deskSolarShoulderLogs" moduleKey="solarLineQc" modulePageKey={modulePageKey}>
      <SolderLine />
    </RequirePermission>
  );
}

function BoxPackingRoute() {
  const { pathname } = useLocation();
  const modulePageKey = pathname.startsWith('/box-packing/reports')
    ? 'boxPackingReports'
    : pathname.startsWith('/box-packing/alerts')
      ? 'packingAlertLogs'
      : 'boxPacking';
  return (
    <RequirePermission permissionKey="logs" permissionSubKey="boxPackingLogs" moduleKey="boxPackingQc" modulePageKey={modulePageKey}>
      <BoxPackingLogs />
    </RequirePermission>
  );
}

export const v2Routes = (
  <Route element={<V2Layout />}>
    <Route index element={<HomeRedirect />} />
    <Route path="dashboard" element={guard('dashboard', undefined, <CommandCenter />)} />
    {/* V2Layout owns this page so it stays mounted while other routes render. */}
    <Route path="live-demo" element={null} />
    <Route path="live" element={guard('LIVE', undefined, <LiveWall />)} />
    <Route path="playback" element={guard('playbacks', undefined, <CameraView />)} />
    <Route path="alerts" element={guard('alerts', undefined, <AlertsView />)} />
    <Route path="incidents" element={guard('incidents', undefined, <IncidentCenter />)} />
    <Route path="analytics" element={guard('analytics', undefined, <Analytics />)} />
    <Route path="email-monitoring" element={<EmailMonitoringDashboard />} />
    {/* AI Assistant — reached from the floating launcher rather than a sidebar
        link, but a normal V2 route so the shell's sidebar/header stay put.
        Ungated for now (same as email-monitoring) until an `assistant`
        permission module exists server-side. */}
    <Route path="assistant" element={<AssistantPage />} />
    <Route path="roles" element={guard('roles', undefined, <RolesPermission />)} />
    <Route path="locations" element={guard('locations', undefined, <Locations />)} />
    <Route path="departments" element={guard('departments', undefined, <Departments />)} />
    <Route path="shifts" element={guard('shifts', undefined, <Shifts />)} />
    <Route path="shift-schedule" element={guard('shifts', undefined, <ShiftSchedule />)} />
    <Route path="register-users" element={guard('Users', undefined, <AddProfile />)} />
    <Route path="profile" element={<MyProfile />} />
    <Route path="admin-profile" element={<AdminProfile />} />
    {/* Hidden integration route. API-key management is restricted to admin sessions. */}
    <Route path="admin/api-keys" element={<ApiKeys />} />
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
    <Route path="logs/sleep-activity" element={guard('logs', 'sleepActivityLogs', <SleepActivityLogs />)} />
    {/* Dimensional QC — Mattress Measurement Logs. */}
    <Route path="logs/measurement" element={<RequirePermission permissionKey="logs" permissionSubKey="measurementLogs" modulePageKey="measurementLogs"><MeasurementLogs /></RequirePermission>} />

    {/* Stevinrock incident logs — each is a thin component wrapping the shared
        IncidentLogsPage with its config; Vehicle Count is a chart page. */}
    <Route path="logs/conveyor" element={guard('logs', 'conveyorLogs', <ConveyorLogs />)} />
    <Route path="logs/vehicle-obstruction" element={guard('logs', 'vehicleObstructionLogs', <VehicleObstructionLogs />)} />
    <Route path="logs/unauthorized-parking" element={guard('logs', 'unauthorizedParkingLogs', <UnauthorizedParkingLogs />)} />
    <Route path="logs/vehicle-count" element={guard('logs', 'vehicleCountLogs', <VehicleCountLogs />)} />
    <Route path="logs/car" element={guard('logs', 'carLogs', <CarLogs />)} />
    <Route path="logs/vehicle-check-in-out" element={guard('logs', 'vehicleCheckInOutLogs', <VehicleCheckInOutLogs />)} />
    <Route path="logs/crusher" element={guard('logs', 'crusherLogs', <CrusherLogs />)} />
    <Route path="logs/cylinder" element={guard('logs', 'cylinderLogs', <CylinderLogs />)} />
    <Route path="logs/line-crossing" element={guard('logs', 'lineCrossingLogs', <LineCrossingLogs />)} />
    <Route path="logs/water-spill" element={guard('logs', 'waterSpillLogs', <WaterSpillLogs />)} />
    <Route path="logs/unauthorized-access" element={guard('logs', 'unauthorizedAccessLogs', <UnauthorizedAccessLogs />)} />
    <Route path="logs/fire-smoke" element={guard('logs', 'fireSmokeLogs', <FireSmokeLogs />)} />
    <Route path="logs/person-fall-sick" element={guard('logs', 'personFallSickLogs', <PersonFallSickLogs />)} />
    <Route path="logs/working-at-height" element={guard('logs', 'workingAtHeightLogs', <WorkingAtHeightLogs />)} />
    <Route path="logs/oil-leakage" element={guard('logs', 'oilLeakageLogs', <OilLeakageLogs />)} />
    <Route path="logs/equipment-oil-leakage" element={guard('logs', 'equipmentOilLeakageLogs', <EquipmentOilLeakageLogs />)} />
    <Route path="logs/vehicle-fuel-oil-leakage" element={guard('logs', 'vehicleFuelOilLeakageLogs', <VehicleFuelOilLeakageLogs />)} />
    <Route path="logs/wrong-location" element={guard('logs', 'wrongLocationLogs', <WrongLocationLogs />)} />
    <Route path="logs/waste-disposal" element={guard('logs', 'wasteDisposalLogs', <WasteDisposalLogs />)} />
    <Route path="logs/animal-entry" element={guard('logs', 'animalEntryLogs', <AnimalEntryLogs />)} />
    <Route path="logs/messy-area" element={guard('logs', 'messyAreaLogs', <MessyAreaLogs />)} />
    {/* Box Packing is a standalone module shell, matching JB Solder Line. */}
    <Route path="box-packing/*" element={<BoxPackingRoute />} />
    {/* Legacy /logs URLs redirect into the standalone module shell. */}
    <Route path="logs/box-packing/alerts" element={<Navigate to="/box-packing/alerts" replace />} />
    <Route path="logs/box-packing/reports" element={<Navigate to="/box-packing/reports" replace />} />
    <Route path="logs/box-packing/analytics" element={<Navigate to="/box-packing" replace />} />
    <Route path="logs/box-packing" element={<Navigate to="/box-packing" replace />} />
    <Route path="logs/stock-counting" element={guard('logs', 'stockCountingLogs', <StockCountingLogs />)} />
    <Route path="logs/stock-counting/analytics" element={guard('logs', 'stockCountingLogs', <StockCountingAnalytics />)} />
    <Route path="logs/blurred-camera" element={guard('logs', 'blurredCameraLogs', <BlurredCameraLogs />)} />
    <Route path="logs/door" element={guard('logs', 'doorDetectionLogs', <DoorDetectionLogs />)} />
    <Route path="logs/door-detection" element={<Navigate to="/logs/door" replace />} />

    {/* Solar Line QC — Desk Solar Shoulder detection. One route so the
        Overview / Alert Logs / Reports tabs share a single mounted shell. */}
    <Route path="solder-line/*" element={<SolderLineRoute />} />
    {/* Hygiene analytics UI disabled; retain bookmarks through the log page. */}
    <Route path="hygiene-analytics" element={<Navigate to="/logs/hygiene" replace />} />
    <Route path="logs/hygiene" element={guard('logs', 'hygieneSanitationFoodSafetyLogs', <HygieneLogs />)} />

    {/* Configure */}
    <Route path="cameras" element={guard('NVR', undefined, <NVRCameras />)} />
    {/* Detections catalogue — ungated for now (same as email-monitoring /
        assistant) so it's reachable from both the admin and user side until a
        `detections` permission module exists server-side. */}
    <Route path="detection-settings" element={<Detections />} />
    <Route path="camera-settings" element={<CameraSettings />} />
    <Route path="measurement-calibration" element={<RequirePermission permissionKey="settings" modulePageKey="measurementCalibration"><MeasurementCalibration /></RequirePermission>} />
    {/* <Route path="engines" element={guard('detectionSettings', undefined, <DetectionSettings />)} /> */}
    <Route path="recipients" element={guard('recipients', undefined, <AlertRecipients />)} />
    <Route path="auto-email-reports" element={guard('autoEmailReports', undefined, <AutoEmailReports />)} />
  
    {/* Administer */}
    <Route path="users" element={guard('Users', undefined, <UsersPage />)} />
    <Route path="settings" element={guard('settings', undefined, <SystemSettings />)} />
    <Route path="raspberry-pi-devices" element={<RequirePermission permissionKey="settings" modulePageKey="raspberryPiDevices"><RaspberryPiDevices /></RequirePermission>} />
    {ADMIN_STORAGE_UI_ENABLED && <Route path="storage-settings" element={guard('storageSettings', undefined, <StorageSettings />)} />}
    {STUBS.map(([key, path, legacy]) => (
      <Route key={key} path={path} element={<Placeholder viewKey={key} legacyPath={legacy} />} />
    ))}
  </Route>
);

export default v2Routes;

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserCheck, MapPinCheck, Activity, Hammer, GitBranch, Car, OctagonAlert, Ban, Tags } from 'lucide-react';
import { GiRoad, GiWaterSplash } from 'react-icons/gi';
import ANPRIcon from '../../assets/ANPR.png';
import { usePermissions } from '@/context/Permission/PermissionContext';

const isStevinrockClient = import.meta.env.VITE_CLIENT == 'stevinrock';

const stevinrockItems = [
  { label: 'Conveyor Logs', icon: GiRoad, route: '/logs/conveyor', permissionKey: 'conveyorLogs' },
  { label: 'Vehicle Obstruction Logs', icon: OctagonAlert, route: '/logs/vehicle-obstruction', permissionKey: 'vehicleObstructionLogs' },
  { label: 'Vehicle Count Logs', icon: Car, route: '/logs/vehicle-count', permissionKey: 'vehicleCountLogs' },
  { label: 'Crusher Logs', icon: Hammer, route: '/logs/crusher', permissionKey: 'crusherLogs' },
  { label: 'Line Crossing Logs', icon: GitBranch, route: '/logs/line-crossing', permissionKey: 'lineCrossingLogs' },
  { label: 'Water Spill Logs', icon: GiWaterSplash, route: '/logs/water-spill', permissionKey: 'waterSpillLogs' },
  { label: 'Unauthorized Access Logs', icon: Ban, route: '/logs/unauthorized-access', permissionKey: 'unauthorizedAccessLogs' },
];

// Per-item route + the `logs.<key>` sub-permission that gates visibility.
const vehicleClientItems = [
  { label: 'Attendance Logs', icon: UserCheck, route: '/logs/attendance', permissionKey: 'attendanceLogs' },
  { label: 'Access Logs', icon: MapPinCheck, route: '/logs/access', permissionKey: 'accessLogs' },
  { label: 'Tagged Users', icon: Tags, route: '/logs/tagged-users', permissionKey: 'accessLogs' },
  { label: 'ANPR Logs', icon: null, img: ANPRIcon, route: '/logs/ANPR', permissionKey: 'ANPRLogs' },
  // { label: 'Track Logs', icon: Activity, route: '/logs/track', permissionKey: 'trackLogs' },
  // { label: 'Desk Logs', icon: Activity, route: '/logs/desk', permissionKey: 'deskLogs' },
  // { label: 'Guard Logs', icon: Activity, route: '/logs/guard', permissionKey: 'guardLogs' },
];

// Preserves the existing index-based route pairing of the legacy (non-vehicle)
// branch — `permissionKey` is aligned with each route's actual target page.
const defaultClientItems = [
  { label: 'Attendance Logs', icon: UserCheck, route: '/logs/attendance', permissionKey: 'attendanceLogs' },
  { label: 'Access Logs', icon: MapPinCheck, route: '/logs/access', permissionKey: 'accessLogs' },
  { label: 'Tagged Users', icon: Tags, route: '/logs/tagged-users', permissionKey: 'accessLogs' },
  { label: 'Person Count Logs', icon: UserCheck, route: '/logs/person-count', permissionKey: 'accessLogs' },
  // { label: 'ANPR Logs', icon: null, img: ANPRIcon, route: '/logs/ANPR', permissionKey: 'ANPRLogs' },
  // { label: 'Vehcile  Logs', icon: Activity, route: '/logs/track', permissionKey: 'trackLogs' },
  // { label: 'Guard Logs', icon: Activity, route: '/logs/guard', permissionKey: 'guardLogs' },
  // { label: 'Track Logs', icon: Activity, route: '/logs/desk', permissionKey: 'deskLogs' },
];

const baseClientItems =
  import.meta.env.VITE_VEHICLE_CLIENT === 'true'
    ? vehicleClientItems
    : defaultClientItems;

const baseSidebarItems = isStevinrockClient
  ? [...baseClientItems, ...stevinrockItems]
  : baseClientItems;

// Logs permissions may be nested ({global, accessLogs, ...}) or legacy flat
// ({view,...}). When nested sub-section objects exist, only the explicit
// section permission counts — falling back to logs.view in that case would
// reveal tabs the user wasn't granted (e.g. ANPRLogs showing when only
// accessLogs/attendanceLogs are enabled). Flat fallback applies only to the
// legacy shape that has no nested sections at all.
const hasLogSectionView = (permissions, sectionKey) => {
  const logs = permissions?.logs;
  if (!logs || typeof logs !== 'object') return false;
  if (logs[sectionKey] && typeof logs[sectionKey] === 'object') {
    return !!logs[sectionKey].view;
  }
  const hasNestedSections = Object.values(logs).some(
    (v) => v && typeof v === 'object'
  );
  if (hasNestedSections) return false;
  if (typeof logs.view === 'boolean') return !!logs.view;
  return false;
};

const LogsSidebar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { permissions, loading: permissionsLoading } = usePermissions();

  // While permissions are still loading, show all items so the sidebar
  // doesn't briefly render empty.
  const sidebarItems = permissionsLoading
    ? baseSidebarItems
    : baseSidebarItems.filter((item) =>
        hasLogSectionView(permissions, item.permissionKey)
      );

  if (sidebarItems.length === 0) return null;

  return (
    <div
      className="fixed hidden sm:flex bg-white ml-4 2xl:ml-5 rounded-[18px]
        left-0 top-[110px] bottom-4 z-40 w-[260px] py-4 px-2 overflow-y-auto"
    >
      <div className="w-full">
        <div className="flex flex-col w-full gap-2">
          <div className="customscrollbar">
            {sidebarItems.map(({ label, icon, img, route }) => {
              const Icon = icon;
              const isActive = pathname === route;

              return (
                <div
                  key={label}
                  className={`flex cursor-pointer items-center gap-2 rounded-2xl hover:bg-gray-100 py-2 pl-2 pr-3 mb-2 ${isActive ? 'bg-[#E3F5FF]' : ''
                    }`}
                  onClick={() => navigate(route)}
                >
                  <div
                    className={`min-w-[50px] min-h-[50px] flex items-center justify-center rounded-lg ${isActive ? 'bg-white' : 'bg-[#F3F3F3]'
                      }`}
                  >
                    {img ? (
                      <img src={img} alt={label} className="w-6 h-6 object-contain" />
                    ) : (
                      <Icon
                        className={`w-6 h-6 ${isActive ? 'text-[#07486A]' : 'text-[#696969]'
                          }`}
                      />
                    )}
                  </div>

                  <span
                    className={`whitespace-nowrap text-[12px] 2xl:text-sm ${isActive
                      ? 'text-[#07486A] font-medium'
                      : 'text-[#696969]'
                      }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogsSidebar;

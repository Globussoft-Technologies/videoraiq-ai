import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Incidentspng from '@/assets/Incidentspng.svg';
import lucide_cctv from '@/assets/lucide_cctv.svg';
import alerts from '@/assets/alerts.svg';
import { getAlertsData } from './Api/get/index';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useAuth } from '@/context/AuthContext';
import DynamicDateTime from '@/utils/DynamicDateTime';
import { usePermissions } from '@/context/Permission/PermissionContext';

const StatCards = ({
  stats,
  dashboardTitles,
  date,
  incidentsPage,
  nvrId,
  channelId,
  location,
  department,
}) => {
  const { permissions } = usePermissions();
  const canView = permissions?.incidents?.view;

  const navigate = useNavigate();
  const [alertsData, setAlertsData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { triggerFlag } = useAuth();
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const prevCriticalCount = useRef(0);

  useEffect(() => {
    const fetchAlertsData = async () => {
      setIsLoading(true);
      try {
        const result = await getAlertsData(nvrId, location, department);
        if (result?.statusCode === 200) {
          setAlertsData(result?.body?.data || {});
        } else {
          setAlertsData({});
        }
      } catch (error) {
        console.error('Error fetching alerts:', error);
        setAlertsData({});
      } finally {
        setIsLoading(false);
      }
    };
    fetchAlertsData();
  }, [triggerFlag, nvrId, location, department]);

  const renderContent = (dataValue) => {
    // Only show actual numeric values here. Heading and paragraph
    // will render Skeleton placeholders when loading.
    return dataValue ?? 0;
  };

  const getCount = (field) =>
    dashboardTitles ? (alertsData?.[field] ?? 0) : (stats?.[field] ?? 0);
  const clickableFor = (field, requirePositive = true) => {
    if (!canView) return false;
    if (!requirePositive) return true;
    return (getCount(field) ?? 0) > 0;
  };

  useEffect(() => {
    if (isLoading) return;
    const currentCount = getCount('criticalAlerts');
    if (currentCount > prevCriticalCount.current && currentCount > 0) {
      setShouldAnimate(true);
      const timer = setTimeout(() => {
        setShouldAnimate(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
    prevCriticalCount.current = currentCount;
  }, [isLoading, alertsData, stats]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-2 md:gap-4 incidentStateCardsContainer">
      {/* Critical Alerts */}
      <div
        onClick={() => {
          if (!clickableFor('criticalAlerts')) return;
          dashboardTitles
            ? navigate('/critical-incidents')
            : navigate('/critical-incidents', {
                state: { incident: incidentsPage, date },
              });
        }}
        className={`col-span-1 xl:col-span-1 2xl:col-span-1 bg-[#FAFAFA] rounded-lg p-1.5 md:p-2.5 lg:p-3 xl:p-4 2xl:p-6 relative overflow-hidden transition-colors transition-shadow flex flex-col justify-between ${clickableFor('criticalAlerts') ? 'cursor-pointer hover:bg-[#F5F5F5]' : 'cursor-default'} ${(shouldAnimate && getCount('criticalAlerts') > 0 && !isLoading) ? 'animate-critical-alert' : ''}`}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="bg-[radial-gradient(circle_at_bottom_right,_rgba(255,91,91,0.5),_transparent_40%)] blur-sm absolute h-[90%] bottom-0 w-[70%] right-0"></div>
        </div>
        <div>
          <div className="flex items-center mb-0.5 md:mb-1 lg:mb-1 xl:mb-2 2xl:mb-4">
            <div className="w-[18px] md:w-[24px] lg:w-[26px] xl:w-[34px] 2xl:w-[43px] h-[18px] md:h-[24px] lg:h-[26px] xl:h-[34px] 2xl:h-[43px] bg-[#ffd7d7] rounded-full flex justify-center items-center mr-1 md:mr-2">
              <AlertTriangle className="h-2 md:h-3 lg:h-3.5 xl:h-5 2xl:h-6 text-red-500" />
            </div>
            <h3 className="text-[8px] md:text-[10px] lg:text-xs xl:text-sm 2xl:text-[16px] font-[500] text-[#333333] whitespace-nowrap overflow-hidden text-ellipsis">
              {isLoading ? (
                <Skeleton width={150} />
              ) : dashboardTitles ? (
                "Today's Critical Incidents"
              ) : (
                'Critical Incidents'
              )}
            </h3>
          </div>
          <p className="text-[6px] md:text-[8px] lg:text-[9px] xl:text-xs 2xl:text-[13px] text-[#626262] font-[400] mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
            {isLoading ? (
              <Skeleton width={100} />
            ) : (
              'Immediate attention needed'
            )}
          </p>
        </div>
        <div className="mt-1 md:mt-2 lg:mt-2 xl:mt-3 2xl:mt-3">
          <p className="text-xs md:text-base lg:text-lg xl:text-xl 2xl:text-[28px] font-[700] text-[#333333]">
            {renderContent(
              dashboardTitles
                ? alertsData?.criticalAlerts
                : stats?.criticalAlerts
            )}
          </p>
        </div>
      </div>

      {/* Total Alerts */}
      <div
        onClick={() => {
          if (!clickableFor('totalAlerts')) return;
          dashboardTitles
            ? navigate('/total-incidents')
            : navigate('/total-incidents', {
                state: { incident: incidentsPage, date },
              });
        }}
        className={`col-span-1 min-[1336px]:col-span-1 xl:col-span-1 2xl:col-span-1 bg-[#FAFAFA] rounded-lg p-1.5 md:p-2.5 lg:p-3 xl:p-4 2xl:p-6 relative overflow-hidden flex flex-col justify-between ${clickableFor('totalAlerts') ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="bg-[radial-gradient(circle_at_bottom_right,_rgba(255,204,0,0.5),_transparent_40%)] blur-sm absolute h-[90%] bottom-0 w-[70%] right-0"></div>
        </div>
        <div>
          <div className="flex items-center mb-0.5 md:mb-1 lg:mb-1 xl:mb-2 2xl:mb-4">
            <div className="w-[18px] md:w-[24px] lg:w-[26px] xl:w-[34px] 2xl:w-[43px] h-[18px] md:h-[24px] lg:h-[26px] xl:h-[34px] 2xl:h-[43px] bg-[#fff3c3] rounded-full flex justify-center items-center mr-1 md:mr-2">
              <img
                src={alerts}
                alt=""
                className="h-2 md:h-3 lg:h-3.5 xl:h-5 2xl:h-6"
              />
            </div>
            <h3 className="text-[8px] md:text-[10px] lg:text-xs xl:text-sm 2xl:text-[16px] font-[500] text-[#333333] whitespace-nowrap overflow-hidden text-ellipsis">
              {isLoading ? (
                <Skeleton width={150} />
              ) : dashboardTitles ? (
                "Today's Total Incidents"
              ) : (
                'Total Incidents'
              )}
            </h3>
          </div>
          <p className="text-[6px] md:text-[8px] lg:text-[9px] xl:text-xs 2xl:text-[13px] text-[#626262] font-[400] mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
            {isLoading ? <Skeleton width={100} /> : 'Alerts Notified'}
          </p>
        </div>
        <div className="mt-1 md:mt-2 lg:mt-2 xl:mt-3 2xl:mt-3">
          <p className="text-xs md:text-base lg:text-lg xl:text-xl 2xl:text-[28px] font-[700] text-[#333333]">
            {renderContent(
              dashboardTitles ? alertsData?.totalAlerts : stats?.totalAlerts
            )}
          </p>
        </div>
      </div>

      {/* Active Cameras */}
      <div
        onClick={() => {
          if (!clickableFor('activeCameras', false)) return;
          dashboardTitles
            ? navigate('/active-cameras', { state: { dashboard: true } })
            : navigate('/active-cameras', {
                state: { incident: incidentsPage, date },
              });
        }}
        className={`col-span-1 min-[1336px]:col-span-1 xl:col-span-1 2xl:col-span-1 bg-[#FAFAFA] rounded-lg p-1.5 md:p-2.5 lg:p-3 xl:p-4 2xl:p-6 relative overflow-hidden ${clickableFor('activeCameras', false) ? 'cursor-pointer hover:bg-[#F5F5F5] transition-colors' : 'cursor-default'} flex flex-col justify-between`}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="bg-[radial-gradient(circle_at_bottom_right,_rgba(7,56,253,0.5),_transparent_40%)] blur-sm absolute h-[90%] bottom-0 w-[70%] right-0"></div>
        </div>
        <div>
          <div className="flex items-center mb-0.5 md:mb-1 lg:mb-1 xl:mb-2 2xl:mb-4">
            <div className="w-[18px] md:w-[24px] lg:w-[26px] xl:w-[34px] 2xl:w-[43px] h-[18px] md:h-[24px] lg:h-[26px] xl:h-[34px] 2xl:h-[43px] bg-[#e5eaff] rounded-full flex justify-center items-center mr-1 md:mr-2">
              <img
                src={lucide_cctv}
                alt=""
                className="h-2 md:h-3 lg:h-3.5 xl:h-5 2xl:h-6"
              />
            </div>
            <h3 className="text-[8px] md:text-[10px] lg:text-xs xl:text-sm 2xl:text-[16px] font-[500] text-[#333333] whitespace-nowrap overflow-hidden text-ellipsis">
              {isLoading ? (
                <Skeleton width={150} />
              ) : (
                'Cameras: Detected / Total'
              )}
            </h3>
          </div>
          <p className="text-[6px] md:text-[8px] lg:text-[9px] xl:text-xs 2xl:text-[13px] text-[#626262] font-[400] mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
            {isLoading ? (
              <Skeleton width={100} />
            ) : (
              'Currently Active Detections'
            )}
          </p>
        </div>
        <div className="mt-1 md:mt-2 lg:mt-2 xl:mt-3 2xl:mt-3">
          <p className="text-xs md:text-base lg:text-lg xl:text-xl 2xl:text-[28px] font-[700] text-[#333333]">
            {renderContent(
              (dashboardTitles
                ? alertsData?.activeCameras
                : stats?.activeCameras) ?? 0
            )}
            /
            {renderContent(
              (dashboardTitles
                ? alertsData?.overAllCameraCount
                : stats?.overAllCameraCount) ?? 0
            )}
          </p>
        </div>
      </div>

      {/* Incidents Resolved */}
      <div
        onClick={() => {
          if (!clickableFor('incidentsResolved')) return;
          dashboardTitles
            ? navigate('/incidents-resolved')
            : navigate('/incidents-resolved', {
                state: { incident: incidentsPage, date },
              });
        }}
        className={`col-span-1 min-[1336px]:col-span-1 xl:col-span-1 2xl:col-span-1 bg-[#FAFAFA] rounded-lg p-1.5 md:p-2.5 lg:p-3 xl:p-4 2xl:p-6 relative overflow-hidden flex flex-col justify-between ${clickableFor('incidentsResolved') ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="bg-[radial-gradient(circle_at_bottom_right,_rgba(150,253,7,0.5),_transparent_40%)] blur-sm absolute h-[90%] bottom-0 w-[70%] right-0"></div>
        </div>
        <div>
          <div className="flex items-center mb-0.5 md:mb-1 lg:mb-1 xl:mb-2 2xl:mb-4">
            <div className="w-[18px] md:w-[24px] lg:w-[26px] xl:w-[34px] 2xl:w-[43px] h-[18px] md:h-[24px] lg:h-[26px] xl:h-[34px] 2xl:h-[43px] bg-[#e8fec9] rounded-full flex justify-center items-center mr-1 md:mr-2">
              <img
                src={Incidentspng}
                alt=""
                className="h-2 md:h-3 lg:h-3.5 xl:h-5 2xl:h-6"
              />
            </div>
            <h3 className="text-[8px] md:text-[10px] lg:text-xs xl:text-sm 2xl:text-[16px] font-[500] text-[#333333] whitespace-nowrap overflow-hidden text-ellipsis">
              {isLoading ? <Skeleton width={150} /> : 'Incidents Resolved'}
            </h3>
          </div>
          <p className="text-[6px] md:text-[8px] lg:text-[9px] xl:text-xs 2xl:text-[13px] text-[#626262] font-[400] mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
            {isLoading ? (
              <Skeleton width={100} />
            ) : (
              'Acknowledged or closed alerts'
            )}
          </p>
        </div>
        <div className="mt-1 md:mt-2 lg:mt-2 xl:mt-3 2xl:mt-3 flex items-end justify-between">
          <p className="text-xs md:text-base lg:text-lg xl:text-xl 2xl:text-[28px] font-[700] text-[#333333]">
            {renderContent(
              dashboardTitles
                ? alertsData?.incidentsResolved
                : stats?.incidentsResolved
            )}
          </p>
          <span className="text-[6px] md:text-[8px] lg:text-[9px] xl:text-xs 2xl:text-[13px]">
            <DynamicDateTime incidentDate={'incidentDate'} />
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatCards;

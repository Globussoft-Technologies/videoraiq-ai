import React, { useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import DetectionToggle from '../../components/DetectionToggle';
import UserContext from '@/context/UserContext/Context';
import SidebarSkeleton from './SidebarSkeleton';
import clsx from 'clsx';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';

const Sidebar = () => {
  const { permissions } = usePermissions();
  const { sidebarShow, setSidebarShow, detectionItems, detectionStates, handleDetectionToggle, isLoading } = useContext(UserContext);
  const location = useLocation();
  const sidebarRef = useRef(null);

  const canView = permissions?.dashboard?.view;
   const canEdit = permissions?.dashboard?.edit;
  const isSettingsPage = location.pathname === '/settings' || location.pathname === '/detection-settings';
  const displayWidgets = location.pathname === '/dashboard';

  if (!canView) {
    return null;
  }

  const handleShow = () => !sidebarShow && setSidebarShow(true);
  const handleHide = () => sidebarShow && setSidebarShow(false);

  const collapsedHeight = detectionItems.length > 0 ? `${60 * detectionItems.length + 12}px` : '200px';

  const renderToggleList = (items, toggleHandler) =>
    items.map((item) => (
      <DetectionToggle
        key={item.id}
        item={{
          ...item,
          enabled: detectionStates[item.id],
        }}
        onChange={toggleHandler}
        disabled={!canEdit}
        isExpanded={sidebarShow}
      />
    ));

  const renderCollapsedIcons = (items) =>
    items.map((item) => {
      const enabled = detectionStates[item.id];
      return (
        <div key={item.id} className="flex justify-center w-full">
          <div className={clsx("min-w-[32px] min-h-[32px] w-8 h-8 xl:w-8 xl:h-8 2xl:w-10 2xl:h-10 flex items-center justify-center bg-[#F3F3F3] rounded-lg transition-all duration-150 hover:bg-gray-200", enabled && 'border-t-4 border-[#07486a]')}>
            <img
              src={item.src}
              alt={item.label}
              className="object-contain transition-all duration-150 transform-gpu w-6 h-6 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7"
            />
          </div>
        </div>
      );
    });

  if (isSettingsPage) {
    return null;
  }

  if (isLoading) {
    return <SidebarSkeleton isExpanded={sidebarShow} />;
  }

  return (
    <> 
    {displayWidgets && 
    <div
      ref={sidebarRef}
      className={clsx("fixed hidden md:flex bg-white ml-4 2xl:ml-5 rounded-[18px] transition-all duration-200 ease-in-out",
                  "left-0 xl:top-[110px] z-40 overflow-hidden",
                  sidebarShow
                      ? 'h-[60%] 2xl:h-[50%] w-[340px] px-6 py-8'
                      : '2xl:w-[100px] md:w-[90px] xl:w-[80px] px-3 py-8 rounded-[18px] shadow-sm min-w-[70px]')}
      style={!sidebarShow ? { height: collapsedHeight } : {}}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocus={handleShow}
      tabIndex={0}
    >
      {/* Expanded View */}
      <div
        className={clsx("absolute inset-0 transition-all duration-200 ease-in-out",
                    sidebarShow
                        ? 'opacity-100 transform-gpu translate-x-0'
                        : 'opacity-0 transform-gpu translate-x-10 pointer-events-none')}
      >
        <div className="flex flex-col rounded-[18px] w-full h-full px-6 py-8 gap-4">
          <div className="flex-1 min-h-0 max-h-[55vh] overflow-y-auto customscrollbar">
            {renderToggleList(detectionItems, handleDetectionToggle)}
          </div>
        </div>
      </div>

      {/* Collapsed View */}
      <div
        className={clsx("absolute inset-0 transition-all duration-200 ease-in-out",
                    sidebarShow
                        ? 'opacity-0 transform-gpu -translate-x-10 pointer-events-none'
                        : 'opacity-100 transform-gpu translate-x-0')}
      >
        <div className="flex flex-col gap-5 w-full items-center justify-start h-full py-4 px-1">
          {renderCollapsedIcons(detectionItems)}
        </div>
      </div>
    </div>}
    </>
  );
};

export default Sidebar;
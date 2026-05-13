import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './Header/Header';
import Sidebar from './Sidebar/Sidebar';
import SettingsSidebar from './Sidebar/SettingsSidebar';
import AdminSidebar from './Sidebar/AdminSidebar';
import LogsSidebar from './Sidebar/LogsSidebar';
import TitleUpdater from '@/components/TitleUpdater';

const SETTINGS_ROUTES = {
  SETTINGS: '/settings',
  DETECTION_SETTINGS: '/detection-settings',
  INNERS_SETTINGS: '/settings/inner',
  NOTIFICATION_RECIPIENTS: '/notification-recipients',
  STORAGE_SETTINGS: '/storage-settings',
  PROFILE: '/profile'
};

const ADMIN_ROUTES = {
  USER_DETAILS: '/user-details',
  ROLES_PERMISSIONS: '/roles-permissions',
  REGISTER_USERS: '/register-users',
  DEPARTMENTS: '/departments',
  LOCATIONS: '/locations'
};

export const Layout = () => {
  const location = useLocation();
  const { pathname } = location;

  const isSettingsPage = Object.values(SETTINGS_ROUTES).includes(pathname);
  const isAdminPage = Object.values(ADMIN_ROUTES).includes(pathname) || pathname.startsWith('/admin/roles');
  const isLogsPage = pathname.startsWith('/logs');
  const isSidebarPage = pathname === '/dashboard';

  const renderSidebar = () => {
    if (isLogsPage) {
      return <LogsSidebar />;
    }
    if (isSettingsPage) {
      return <SettingsSidebar />;
    }
    if (isAdminPage) {
      return <AdminSidebar />;
    }
    // if (isSidebarPage) {
    //   return <Sidebar />;
    // }
    return null;
  };

  const hasSidebar = isSettingsPage || isAdminPage || isLogsPage;

  useEffect(() => {
    // Reset the main app scroll container to top on route change so each page starts scrolled to top
    const el = document.querySelector('.app-scroll-container');
    if (el) el.scrollTo({ top: 0, behavior: 'auto' });
    // If ever switch to body scrolling, you can also call window.scrollTo(0,0)
  }, [pathname]);

  return (
    <div className="flex flex-col w-full h-screen bg-[#f7f8f8]">
      <TitleUpdater />
      <div className="m-[0.9375rem] sticky top-[0] z-50 flex-shrink-0 headerContainer">
        <Header />
      </div>

  <div className={`flex w-full 2xl:p-5 2xl:pt-0 relative flex-1 overflow-y-auto app-scroll-container ${hasSidebar ? 'gap-[0.9375rem] xl:gap-[0.625rem]' : ''}`}>
        {hasSidebar ? (
          <>
            {renderSidebar()}
            <div className={`${isSettingsPage || isAdminPage || isLogsPage ? '2xl:w-[14.375rem] w-[15rem]' : '2xl:w-[100px] w-[6rem]'} h-full hidden sm:flex`}></div>
            <div className={`sm:flex-1 w-full max-w-full min-w-0 h-full`}>
              <Outlet />
            </div>
          </>  
        ) : (
          <div className='w-full h-full'>
            <Outlet />
          </div>
        )}
      </div>
    </div>
  );
};

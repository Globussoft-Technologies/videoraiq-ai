import { useNavigate } from 'react-router-dom';
import logotrack from '@/assets/logo.svg';
import React, { useContext, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CheckCircle2Icon, Download, Search, Volume2, VolumeX } from 'lucide-react';
import settingsBlue from '../../assets/settingsBlue.png';
import DetectionToggle from '@/components/DetectionToggle';
import UserContext from '@/context/UserContext/Context';
import { Flame, ShieldAlert, Smartphone, Cone, Theater } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import HeaderSkeleton from './HeaderSkeleton';
import DesktopNav from './DesktopNav';
import MobileNav from './MobileNav';
import ProfileDropdown from './ProfileDropdown';
import HeaderActions from './HeaderActions';
import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';
import getAccessToken from '@/utils/getAccessToken';
import { usePermissions } from '@/context/Permission/PermissionContext';
import { useAllDetections } from '@/context/Sockets/AllDetectionContext';
const CURRENT_EXE_VERSION = import.meta.env.VITE_APP_CURRENT_EXE_VERSION;
const socket_Url = import.meta.env.VITE_SOCKET_URL;
const url=import.meta.env.VITE_ENV
const HIDE_PLAYBACK_FEATURE = import.meta.env.VITE_HIDE_PLAYBACK_FEATURE || '';

const Header = () => {
  const { user,setUser, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const { isMuted, toggleMute } = useAllDetections();
  const { detectionItems, detectionStates, handleDetectionToggle } = useContext(UserContext);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [profileDrop, setProfileDrop] = useState(false);
  const [exeVersion, setVersion] = useState(true);
  const [UpgradeReqiore, setUpgradeRequire] = useState(false)
  const [installerStatus, setInstallerStatus] = useState(false);
  const navigate = useNavigate();
  
  // Get user ID from token and check if playback should be hidden
  const isPlaybackHidden = () => {
    try {
      const token = getAccessToken();
      if (!token) return false;
      
      const decodedToken = jwtDecode(token);
      const userId = decodedToken?.user_id;
      
      if (!userId) return false;

      // Hide playback module specifically for user ID 42
      if (String(userId) === '42') {
        return true;
      }
      
      // Parse the comma-separated user IDs from env variable
      const hiddenUserIds = HIDE_PLAYBACK_FEATURE.split(',').map(id => id.trim()).filter(id => id);
      
      return hiddenUserIds.includes(String(userId));
    } catch (error) {
      console.error('Error checking playback feature:', error);
      return false;
    }
  };
  console.log("Permissions in Header:", permissions);
  
  // Filter navLinks based on playback feature availability
  const baseNavLinks = [
    { to: '/dashboard', label: 'Dashboard', permissionKey: 'dashboard' },
    { to: '/incidents', label: 'Incidents', permissionKey: 'incidents', activePaths: ['/critical-incidents', '/total-incidents', '/incidents-resolved', '/active-cameras', '/incidents'] },
    { to: '/nvr-settings', label: 'NVR', permissionKey: 'NVR', activePaths: ['/nvr-settings', '/streams/camera-settings'] },
    { to: '/cameraview', label: 'Live', permissionKey: 'LIVE' },
    { to: '/Playback', label: 'Playback', permissionKey: 'playbacks' },
    // { to: '/notification-recipients', label: 'Alert Recipients' },
    { to: import.meta.env.VITE_DESK_CLIENT === 'true' ? '/detection-settings' : '/profile', label: 'Settings', permissionKey: 'settings', activePaths: ['/storage-settings','/detection-settings','/profile','/notification-recipients', '/settings/inner'] },
    { to: '/logs', label: 'Logs', permissionKey: 'logs' },
    { to: '/user-details', label: 'User Details', permissionKey: 'Users', activePaths: ['/user-details','/roles-permissions','/register-users'] },
  ];

  const navLinks = baseNavLinks.filter(({ label, permissionKey }) => {
    if (label === 'Playback' && isPlaybackHidden()) return false;
    // If permissions not yet loaded, show all tabs
    if (!permissions || Object.keys(permissions).length === 0) return true;
    if (!permissionKey) return true;
    // Settings tab: show if any of the settings sub-permissions are granted
    if (permissionKey === 'settings') {
      return (
        permissions?.detectionSettings?.view === true ||
        permissions?.profiles?.view === true ||
        permissions?.recipients?.view === true ||
        permissions?.storageSettings?.view === true
      );
    }
    // Logs tab: API may return either the flat {view,...} shape or a nested
    // shape with sub-permissions (global, accessLogs, attendanceLogs, ...).
    if (permissionKey === 'logs') {
      const logs = permissions?.logs;
      if (!logs) return false;
      if (typeof logs?.global?.view === 'boolean') return logs.global.view === true;
      // Flat shape: { view, create, edit, delete }
      if (typeof logs.view === 'boolean') return logs.view === true;
      return Object.values(logs).some((v) => v?.view === true);
    }
    return permissions?.[permissionKey]?.view === true;
  });
  useEffect(() => {
    if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading]);

  
  useEffect(() => {
    const socket =new WebSocket(`${socket_Url}/statusinfo`);

    socket.onopen = (event) => {
      setInstallerStatus(true);
    };

    socket.onmessage = (event) => {
      if(event.data !=CURRENT_EXE_VERSION ){
        setUpgradeRequire(true)
        };
        
      }
    socket.onclose = (event) => {
      // console.info('Disconnected from monitoring socket:', event.reason);
    };

    // Cleanup function
    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, []); // Empty dependency array = run once on mount


  // useEffect(() => {
  //   const socket =new WebSocket('ws://localhost:57032/monitoring');

  //   socket.onopen = (event) => {
  //     console.info('Connected to monitoring socket', event);
  //   };

  //   socket.onmessage = (event) => {
  //     console.info('Received message from monitoring socket:', event.data);
  //   };

  //   socket.onclose = (event) => {
  //     console.info('Disconnected from monitoring socket:', event.reason);
  //   };

  //   // Cleanup function
  //   return () => {
  //     if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
  //       socket.close();
  //     }
  //   };
  // }, []); // Empty dependency array = run once on mount



  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);
function getCookieName() {
  // const hostname = window.location.hostname;
  // if (hostname.includes("dev-dashboard")) return "dev-access-token";
  // if (hostname.includes("app-dashboard")) return "prod-access-token";
  // if (hostname === "localhost") return "local-access-token";

  if(url=="dev") 
  {
    return "dev-access-token"
  }else if(url=="prod")
  {
    return "prod-access-token"           
  }else{
      return "access-token" 
          }       
}
  const handleLogout = () => {  
  try{
    // const domain = `.${window.location.hostname.split('.').slice(-2).join('.')}`;
    // const domain=window.location.hostname;
    const cookieName = getCookieName();
    const token = Cookies.get(cookieName);
    const decodedtoken = jwtDecode(token);
    if (decodedtoken?.memberId) {
      Cookies.remove(cookieName, {
      path: '/',
      // domain: domain,
    });
      setUser(null);
      navigate('/user-login');
    } else {
       navigate('/logout');
    }
  }catch(error){
    console.log('Logout error:', error);
  }
  };

  if (authLoading || loading) {
    return <HeaderSkeleton />;
  }

  return (
    <header className="bg-white px-4 py-2 flex items-center justify-between border-b border-gray-100 rounded-2xl h-16 md:h-20">
      <div className="flex justify-between gap-4">
        <img src={logotrack} onClick={() => navigate('/')} alt="Logo" className="h-8 sm:h-10 cursor-pointer" />
        <DesktopNav navLinks={navLinks} />
      </div>

      <div className="flex-1 flex justify-end">
        <div className="w-full flex items-center justify-between lg:w-auto md:justify-end lg:gap-4">
          {/* HamburgerButton inlined */}
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="flex md:hidden flex-col justify-around w-6 h-6 bg-transparent border-none cursor-pointer p-0 z-50"
          >
            <span
              className={`h-[3px] rounded-[10px] ml-3 w-6 bg-[#07486A]/80 transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}
            />
            <span className={`h-[3px] rounded-[10px] ml-3 w-6 bg-[#07486A]/80 transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
            <span
              className={`h-[3px] rounded-[10px] ml-3 w-6 bg-[#07486A]/80 transition-all duration-300 ease-in-out ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}
            />
          </button>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* <HeaderActions  UpgradeReqiore = {UpgradeReqiore} installerStatus ={installerStatus} setInstallerStatus={setInstallerStatus} /> */}
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute detection audio' : 'Mute detection audio'}
              title={isMuted ? 'Unmute detection audio' : 'Mute detection audio'}
              className="flex items-center justify-center w-9 h-9 rounded-full border border-[#E6E6E6] bg-white hover:bg-[#F5F5F5] cursor-pointer text-[#07486a]"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            {user?.name_f && (
              <span className="hidden md:flex font-medium text-sm text-[#07486a]">
                Welcome, {user.name_f.charAt(0).toUpperCase() + user.name_f.slice(1)}
              </span>
            )}
            <ProfileDropdown
              user={user}
              handleLogout={handleLogout}
              profileDrop={profileDrop}
              setProfileDrop={setProfileDrop}
            />
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        <MobileNav
          isOpen={isMobileMenuOpen}
          setIsOpen={setIsMobileMenuOpen}
          detectionItems={detectionItems}
          detectionStates={detectionStates}
          handleToggleChange={handleDetectionToggle}
          navLinks={navLinks}
        />
      </div>
    </header>
  );
};

export default Header;

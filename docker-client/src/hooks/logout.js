import { deleteCookie } from '@/components/Auth/IsAuth';
import Cookies from 'js-cookie';
const url=import.meta.env.VITE_ENV
export function logout() {
  // const domain = window.location.hostname;
  // let cookieName;                       
  // if (domain.includes("dev"))
  // {
  //   cookieName="dev-access-token"
  // }else if(domain.includes("app")){
  //  cookieName = "prod-access-token"           
  // }else{
  //   cookieName="local-access-token"
  // }
  let cookieName;
  if(url=="dev")
   {
      cookieName="dev-access-token"
   }else if(url=="prod")
   {
      cookieName = "prod-access-token"           
   }else{
      cookieName = "access-token" 
    }
            
  const queryKey = cookieName;

  // Preserve isDarkMode state
  const isDarkMode = localStorage.getItem('isDarkMode');
   const selectedGrid = localStorage.getItem("selectedGrid");
  // Attendance
const attendanceAutoRefresh = localStorage.getItem("attendance_auto_refresh_enabled");
const attendanceInterval = localStorage.getItem("attendance_auto_refresh_interval");

// Access
const accessAutoRefresh = localStorage.getItem("access_auto_refresh_enabled");
const accessInterval = localStorage.getItem("access_auto_refresh_interval");

// Incidents
const incidentsAutoRefresh = localStorage.getItem("incidents_auto_refresh");
const incidentsInterval = localStorage.getItem("incidents_refresh_interval");

  // Get current domain dynamically
  // const domain = `.${window.location.hostname.split('.').slice(-2).join('.')}`;
  const cookiesToPreserve = ['admin-remember-me', 'remember-me'];
  // Clear cookies (including domain-based deletion)
  document.cookie = `${queryKey}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0].trim();
    // Skip preserving remember-me cookies
    if (!cookiesToPreserve.includes(name)) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; `;
    }
  });

  // Clear local storage but preserve isDarkMode
  localStorage.clear();
  if (isDarkMode) {
    localStorage.setItem('isDarkMode', isDarkMode);
  }
if (attendanceAutoRefresh !== null) {
  localStorage.setItem("attendance_auto_refresh_enabled", attendanceAutoRefresh);
}
if (attendanceInterval !== null) {
  localStorage.setItem("attendance_auto_refresh_interval", attendanceInterval);
}

/* Access */
if (accessAutoRefresh !== null) {
  localStorage.setItem("access_auto_refresh_enabled", accessAutoRefresh);
}
if (accessInterval !== null) {
  localStorage.setItem("access_auto_refresh_interval", accessInterval);
}

/* Incidents */
if (incidentsAutoRefresh !== null) {
  localStorage.setItem("incidents_auto_refresh", incidentsAutoRefresh);
}
if (incidentsInterval !== null) {
  localStorage.setItem("incidents_refresh_interval", incidentsInterval);
}

  if (selectedGrid !== null)
    localStorage.setItem("selectedGrid", selectedGrid);
  // Clear session storage
  sessionStorage.clear();

  // Delete specific cookie
  deleteCookie(queryKey);
}

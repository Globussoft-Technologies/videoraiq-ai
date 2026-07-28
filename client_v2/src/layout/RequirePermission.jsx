import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePermissions } from '@/context/PermissionContext';
import { NAV_GROUPS } from './nav.config';
import PageLoader from '@/components/PageLoader';

// Mirrors Sidebar.jsx's isItemVisible — kept in sync there and in
// HomeRedirect.jsx since all three read the same permissionKey/permissionSubKey
// shape off nav.config.js.
function isItemVisible(item, permissions) {
  if (!item.permissionKey) return true;
  if (item.permissionSubKey) {
    return permissions?.[item.permissionKey]?.[item.permissionSubKey]?.view === true;
  }
  return permissions?.[item.permissionKey]?.view === true;
}

function firstVisiblePath(permissions) {
  for (const group of NAV_GROUPS) {
    if (group.hidden) continue;
    for (const item of group.items) {
      if (isItemVisible(item, permissions)) return item.path;
    }
  }
  return 'dashboard';
}

// Route-level counterpart to Sidebar.jsx's link hiding: the sidebar only
// hides nav *links*, it never stopped someone from typing/bookmarking/
// refreshing a URL directly and landing on a page their role can't view (no
// route in routes.jsx had any guard at all). Wrap a gated route's element in
// this so navigating straight to e.g. /dashboard with dashboard.view === false
// bounces to the first page the role actually has, instead of rendering it
// anyway.
export default function RequirePermission({ permissionKey, permissionSubKey, children }) {
  const { permissions, loading } = usePermissions();

  if (loading) return <PageLoader />;

  const item = { permissionKey, permissionSubKey };
  if (isItemVisible(item, permissions)) return children;

  toast.error("You don't have permission to view that page.");
  return <Navigate to={firstVisiblePath(permissions)} replace />;
}

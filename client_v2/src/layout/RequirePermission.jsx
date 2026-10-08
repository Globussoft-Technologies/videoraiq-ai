import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/context/PermissionContext';
import { NAV_GROUPS } from './nav.config';
import PageLoader from '@/components/PageLoader';
import { ErrorState } from '@/components/States';
import { isClientNavGroupVisible, isClientNavItemVisible, isItemVisible, isModuleAllowed } from '@/lib/navVisibility';
import { useModuleConfig } from '@/context/ModuleConfigContext';

// Redirects follow the same role and client module grants as the sidebar.
function firstVisiblePath(permissions, modules) {
  for (const group of NAV_GROUPS) {
    if (group.hidden || !isClientNavGroupVisible(group)) continue;
    for (const item of group.items) {
      if (!isClientNavItemVisible(item) || !isModuleAllowed(item, modules)) continue;
      if (!isItemVisible(item, permissions)) continue;
      const child = item.children?.find((entry) => (
        isClientNavItemVisible(entry) && isModuleAllowed(entry, modules) && isItemVisible(entry, permissions)
      ));
      const path = item.children?.length ? child?.path : item.path;
      if (path) return path;
    }
  }
  return null;
}

// Route-level counterpart to Sidebar.jsx's link hiding: the sidebar only
// hides nav *links*, it never stopped someone from typing/bookmarking/
// refreshing a URL directly and landing on a page their role can't view (no
// route in routes.jsx had any guard at all). Wrap a gated route's element in
// this so navigating straight to e.g. /dashboard with dashboard.view === false
// bounces to the first page the role actually has, instead of rendering it
// anyway.
export default function RequirePermission({ permissionKey, permissionSubKey, moduleKey = 'mattressMeasurement', modulePageKey, children }) {
  const { permissions, loading, error, refresh } = usePermissions();
  const { modules, loading: modulesLoading } = useModuleConfig();

  if (loading || modulesLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refresh} minH={360} />;
  if (!permissions || Object.keys(permissions).length === 0) {
    return <ErrorState error={new Error('No page permissions are available for your account.')} onRetry={refresh} minH={360} />;
  }

  const item = { permissionKey, permissionSubKey };
  if (isItemVisible(item, permissions) && (!modulePageKey || isModuleAllowed({ moduleKey, modulePageKey }, modules))) return children;

  const fallback = firstVisiblePath(permissions, modules);
  return fallback
    ? <Navigate to={`/${fallback}`} replace />
    : <ErrorState error={new Error("You don't have permission to access this page.")} minH={360} />;
}

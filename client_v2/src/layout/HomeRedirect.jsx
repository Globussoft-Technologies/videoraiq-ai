import { Navigate } from 'react-router-dom';
import { NAV_GROUPS } from './nav.config';
import { usePermissions } from '@/context/PermissionContext';
import PageLoader from '@/components/PageLoader';
import { isClientNavGroupVisible, isClientNavItemVisible, isItemVisible, isModuleAllowed } from '@/lib/navVisibility';
import { useModuleConfig } from '@/context/ModuleConfigContext';

// Replaces the old static `<Navigate to="dashboard" />` on the index route.
// Landing on /dashboard regardless of role meant a role without dashboard
// access saw a blank Command Center instead of a page it could actually use.
// Waits for permissions to load, then sends the user to the first sidebar
// item their role can view (same order as Sidebar.jsx renders NAV_GROUPS),
// falling back to /dashboard only if nothing else is permitted either.
export default function HomeRedirect() {
  const { permissions, loading } = usePermissions();
  const { modules, loading: modulesLoading } = useModuleConfig();

  if (loading || modulesLoading) return <PageLoader />;

  for (const group of NAV_GROUPS) {
    if (group.hidden || !isClientNavGroupVisible(group)) continue;
    for (const item of group.items) {
      if (!isClientNavItemVisible(item) || !isModuleAllowed(item, modules)) continue;
      if (isItemVisible(item, permissions)) {
        const child = item.children?.find((entry) => (
          isClientNavItemVisible(entry) && isModuleAllowed(entry, modules) && isItemVisible(entry, permissions)
        ));
        const path = item.children?.length ? child?.path : item.path;
        if (path) return <Navigate to={path} replace />;
      }
    }
  }

  return <Navigate to="dashboard" replace />;
}

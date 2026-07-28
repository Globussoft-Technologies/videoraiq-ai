import { Navigate } from 'react-router-dom';
import { NAV_GROUPS } from './nav.config';
import { usePermissions } from '@/context/PermissionContext';
import PageLoader from '@/components/PageLoader';

// Mirrors Sidebar.jsx's isItemVisible — an item with no permissionKey is
// always visible; one with permissionSubKey reads a nested logs.* module.
// Also mirrors its empty-permissions passthrough: without it, a render caught
// between `loading` flipping false and `permissions` actually populating (or
// a superseded fetch from a rapid logout/login) makes every gated item read
// as invisible, so this loop falls through everything and the final fallback
// fires — sending a fully-permitted user through the wrong path first.
function isItemVisible(item, permissions) {
  if (!item.permissionKey) return true;
  if (!permissions || Object.keys(permissions).length === 0) return true;
  if (item.permissionSubKey) {
    return permissions?.[item.permissionKey]?.[item.permissionSubKey]?.view === true;
  }
  return permissions?.[item.permissionKey]?.view === true;
}

// Replaces the old static `<Navigate to="dashboard" />` on the index route.
// Landing on /dashboard regardless of role meant a role without dashboard
// access saw a blank Command Center instead of a page it could actually use.
// Waits for permissions to load, then sends the user to the first sidebar
// item their role can view (same order as Sidebar.jsx renders NAV_GROUPS),
// falling back to /dashboard only if nothing else is permitted either.
export default function HomeRedirect() {
  const { permissions, loading } = usePermissions();

  if (loading) return <PageLoader />;

  for (const group of NAV_GROUPS) {
    if (group.hidden) continue;
    for (const item of group.items) {
      if (isItemVisible(item, permissions)) {
        return <Navigate to={item.path} replace />;
      }
    }
  }

  return <Navigate to="dashboard" replace />;
}

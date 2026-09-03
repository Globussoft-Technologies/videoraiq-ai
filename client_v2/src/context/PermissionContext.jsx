import { createContext, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";
import { useAuth } from "./AuthContext";

const PermissionContext = createContext();

const FULL_ACCESS = { view: true, create: true, edit: true, delete: true };
const VIEW_ONLY = { view: true, create: false, edit: false, delete: false };
const NO_DELETE = { view: true, create: true, edit: true, delete: false };
const DENY = { view: false, create: false, edit: false, delete: false };

// Modules added to permissions.config.js after roles were first seeded. A role
// stored before the module existed has no key for it, which reads as a denial
// and hides the page from everyone — including admins — until someone re-saves
// the role in Roles & Permission. Each entry mirrors that module's row in the
// server's four role presets, keyed by role name.
const BACKFILLED_MODULES = {
  settings: { admin: FULL_ACCESS, read: VIEW_ONLY, write: NO_DELETE },
  shifts: { admin: FULL_ACCESS, read: VIEW_ONLY, write: NO_DELETE },
};

/**
 * Fill in modules a stored role predates, preserving the three built-in role
 * presets. Custom roles stay denied until an admin explicitly grants the
 * module in Roles & Permission.
 */
function normalizePermissionConfig(roleData) {
  const config = roleData?.permissionConfig;
  if (!config) return {};

  const roleName = String(roleData?.roleName || '').toLowerCase();
  const missing = Object.entries(BACKFILLED_MODULES).filter(([key]) => !config[key]);
  if (!missing.length) return config;

  return {
    ...config,
    ...Object.fromEntries(
      missing.map(([key, presets]) => [key, { ...(presets[roleName] || DENY) }]),
    ),
  };
}

const getAllUserPermissions = async () => {
  const token = getAccessToken();
  const HOST = import.meta.env.VITE_BACKEND;
  return axios.get(`${HOST}/permissions/user-permissions`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

export const PermissionProvider = ({ children }) => {
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const { user, setUser } = useAuth();
  // Guards against out-of-order responses: a fetch kicked off for a previous
  // `user` (e.g. still in flight right as logout->login swaps the user, or
  // React 18 StrictMode's dev-only double effect invocation) can resolve
  // AFTER the fetch for the current user and clobber correct, just-loaded
  // permissions with stale/empty ones — which read as a real (if transient)
  // permission loss to RequirePermission/Sidebar, not just a loading flicker.
  // Only the most recently started fetch is allowed to commit state.
  const requestIdRef = useRef(0);

  const fetchPermissions = async () => {
    const requestId = ++requestIdRef.current;
    if (!user) {
      if (requestId === requestIdRef.current) setPermissions({});
      return;
    }

    setLoading(true);
    try {
      const response = await getAllUserPermissions();
      if (requestId !== requestIdRef.current) return;
      if (response?.data?.body?.status === "success") {
        const roleData = response.data.body.data[0];
        setPermissions(normalizePermissionConfig(roleData));
        // /auth/by-login-token only decodes the JWT payload from login time —
        // it never re-checks the DB, so user.roleId in AuthContext goes stale
        // the moment an admin changes this user's role elsewhere, and stays
        // stale until the token is reissued (re-login). This endpoint DOES
        // resolve the role fresh from the DB on every fetch, so patch that
        // fresh {_id, roleName} back into user.roleId here rather than
        // waiting for a full re-login.
        if (roleData?._id && setUser) {
          setUser(prev => {
            if (!prev) return prev;
            const prevRoleId = prev.roleId?._id || prev.roleId || prev.roleIds?._id || prev.roleIds;
            // Same role already reflected — return the same reference so this
            // doesn't retrigger the [user] effect below and fetch in a loop.
            if (String(prevRoleId || '') === String(roleData._id)) return prev;
            return { ...prev, roleId: { _id: roleData._id, roleName: roleData.roleName } };
          });
        }
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to fetch permissions:", error);
      setPermissions({});
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [user]);

  return (
    <PermissionContext.Provider value={{ permissions, loading }}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermissions = () => useContext(PermissionContext);

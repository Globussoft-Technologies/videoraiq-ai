import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";
import { useAuth } from "./AuthContext";

const PermissionContext = createContext();

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

  const fetchPermissions = async () => {
    if (!user) {
      setPermissions({});
      return;
    }

    setLoading(true);
    try {
      const response = await getAllUserPermissions();
      if (response?.data?.body?.status === "success") {
        const roleData = response.data.body.data[0];
        setPermissions(roleData?.permissionConfig || {});
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
      console.error("Failed to fetch permissions:", error);
      setPermissions({});
    } finally {
      setLoading(false);
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

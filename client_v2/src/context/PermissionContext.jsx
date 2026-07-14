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
  const { user } = useAuth();

  const fetchPermissions = async () => {
    if (!user) {
      setPermissions({});
      return;
    }

    setLoading(true);
    try {
      const response = await getAllUserPermissions();
      if (response?.data?.body?.status === "success") {
        setPermissions(response?.data.body.data[0].permissionConfig || {});
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

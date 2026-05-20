import { createContext, useContext, useEffect, useState } from "react";
import { getAllUsesrPermissions } from "../Api/get";
import { useAuth } from "../AuthContext";

const PermissionContext = createContext();

export const PermissionProvider = ({ children }) => {
    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    const fetchPermissions = async () => {
        if (!user) {
            // Don't resolve loading yet — wait until the user is available
            // so consumers don't briefly see empty permissions and flash AccessDenied.
            setPermissions({});
            return;
        }

        setLoading(true);
        try {
            const response = await getAllUsesrPermissions();
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

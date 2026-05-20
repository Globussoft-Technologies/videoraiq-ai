import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import getAccessToken from '../../utils/getAccessToken';
import { jwtDecode } from 'jwt-decode';
import { checkNVRsPresent } from './Api/get';
import { usePermissions } from '@/context/Permission/PermissionContext';

export const NvrAuthCheck = ({ children }) => {
    const navigate = useNavigate();
    const { permissions } = usePermissions();

    useEffect(() => {
        const checkAuthAndRedirect = async () => {
            const token = getAccessToken();
            if (!token) return;

            let decoded;
            try {
                decoded = jwtDecode(token);
            } catch (e) {
                console.error('Invalid JWT token', e);
                return;
            }

            const userId = decoded?.user_id;
            if (!userId) return;

            // Only redirect to NVR settings if the user actually has NVR permission
            const hasNvrPermission = permissions?.NVR?.view === true;

            try {
                const response = await checkNVRsPresent();
                const data = response.data?.body?.data;

                if (!(Array.isArray(data?.nvrs) && data?.nvrs?.length > 0)) {
                    if (hasNvrPermission) {
                        navigate('/nvr-settings');
                    }
                }
            } catch (err) {
                console.error('API error checking NVRs:', err);
                if (hasNvrPermission) {
                    navigate('/nvr-settings');
                }
            }
        };

        checkAuthAndRedirect();
    }, [navigate, permissions]);

    return <div>{children}</div>;
};

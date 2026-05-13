import getAccessToken from "@/utils/getAccessToken";
import axios from "axios";
const HOST = import.meta.env.VITE_BACKEND;

export const updateRole = async (roleId, roleData) => {
    const token = await getAccessToken();
    const response = await axios.put(`${HOST}/api/v1/roles/update?roleId=${roleId}`, roleData, {
        headers: {
            'Content-Type': 'application/json',
            'x-access-token': token
        }
    })
    return response.data;
}

export const updatePermissionByRole = async (permissionId, permissionData) => {
    const token = await getAccessToken();
    const response = await axios.put(`${HOST}/api/v1/permissions/update?permissionId=${permissionId}`, permissionData, {
        headers: {
            'Content-Type': 'application/json',
            'x-access-token': token
        }
    })
    return response.data;
}

export const updateRolePermissions = async (roleId, roleData) => {
    const token = await getAccessToken();
    const response = await axios.put(`${HOST}/api/v1/roles/update?roleId=${roleId}`, roleData, {
        headers: {
            'Content-Type': 'application/json',
            'x-access-token': token
        }
    })
    return response.data;
}
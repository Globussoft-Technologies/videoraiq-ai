import React from "react";
import getAccessToken from "@/utils/getAccessToken";
import { jwtDecode } from 'jwt-decode';
import axios from "axios";
import { waitForToken } from "@/utils/waitForToken";
// const token = getAccessToken();
const apiUrl = import.meta.env.VITE_BACKEND;

export const markAlertResolved = async (id, data) => {
    const token =await waitForToken();
    const response = await axios.put(`${apiUrl}/api/v1/incidents/${id}`, data, {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    });
    return response?.data?.body;
};

  export const updateAuthorizedUsers = async (employeeId, data, departmentId) => {
    const token =await waitForToken();
    const response = await axios.put(`${apiUrl}/api/v1/authorizedUsers/update?userId=${employeeId}&departmentId=${departmentId}`, data, {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    });
    return response?.data;
  }

  export const tagUser = async (userId, data) => {
    const token =await waitForToken();
    const query = userId ? `?userId=${userId}` : '';
    const response = await axios.patch(`${apiUrl}/api/v1/authorizedUsers/tag-user${query}`, data, {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    });
    return response?.data;
  }

    export const createCameraAliasName = async (cameraId, data) => {
    const token =await waitForToken();
    const response = await axios.put(`${apiUrl}/api/v1/channel/${cameraId}`, data, {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    });
    return response?.data;
  }
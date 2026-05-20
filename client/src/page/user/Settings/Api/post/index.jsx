import React from "react";
import getAccessToken from "@/utils/getAccessToken";
import { jwtDecode } from 'jwt-decode';
import { waitForToken } from "@/utils/waitForToken";
const apiUrl = import.meta.env.VITE_BACKEND;


export const verifyOtp = async ({ type, value, tokenData }) => {
  //  const token = await waitForToken();
  const info = {
    [type]: value,

  };

  try {
    const response = await fetch(
      `${apiUrl}/api/v1/recipients/verify?alertType=${type}&otp=${tokenData}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 'x-access-token': token,
        },
        body: JSON.stringify(info),
      }
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error verifying OTP:", error);

  }
};


export const createAlert = async (alertData) => {
    const token = await waitForToken();
  const {type,value,fullName,incidentTypes} = alertData;
  const info = {
    [type]: value,
    "fullName":fullName,
    "incidentTypes": incidentTypes || []
  };
 
  try {
    const response = await fetch(`${apiUrl}/api/v1/recipients/create?alertType=${type}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        'x-access-token': token,
      },
      body: JSON.stringify(info),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error creating alert:", error);
  }
}

export const resendMailOrSMS = async ({id,type,value}) => {
    const token = await waitForToken();
  const info = {
    [type]: value,

  };
    const response = await fetch(
      `${apiUrl}/api/v1/recipients/resendMailOrSMS?alertType=${type}&id=${id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'x-access-token': token,
        },
        body: JSON.stringify(info),
      }
    );
    const data = await response.json();

    return data.body;
  };
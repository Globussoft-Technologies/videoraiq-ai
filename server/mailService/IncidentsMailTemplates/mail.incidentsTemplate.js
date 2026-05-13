import config from "config";
import { encrypt, decrypt } from "../../utils/cryptoUtils.js";
export let IncidentMail = (incidentData, alertBasedOn, nvrOrChannelDetails) => {
  const {
    incidentName,
    incidentType,
    timeOfIncident,
    description,
    cameraId,
    nvrId,
    channelId,
    zone,
    severity,
    videoLink,
    durationOfOpen,
    noUniformCount,
    partialUniformCount,
    incorrectUniformCount,
    totalPersons,
    detectionZone,
    violatedPersonsCount,
    periodOfViolation,
    absenceDuration,
    personsAbsent,
    absentPersonsName,
    vehicleNumber,
    vehicleType,
    userId,
  } = incidentData;

  const renderDeviceDetails = () => {
    if (alertBasedOn === "NVR") {
      const {
        nvrName,
        ip,
        port,
        rtspPort,
        username,
        model,
        serialNumber,
        firmwareVersion,
        macAddress,
        deviceName,
      } = nvrOrChannelDetails;

      return `
        <div class="section">
          <h3>NVR Details</h3>
          <p><span class="label">Name:</span> ${nvrName}</p>
          <p><span class="label">IP:</span> ${ip}</p>
          <p><span class="label">Port:</span> ${port}</p>
          <p><span class="label">RTSP Port:</span> ${rtspPort}</p>
          <p><span class="label">Username:</span> ${username}</p>
          <p><span class="label">Model:</span> ${model}</p>
          <p><span class="label">Serial Number:</span> ${serialNumber}</p>
          <p><span class="label">MAC Address:</span> ${macAddress}</p>
          <p><span class="label">Device Name:</span> ${deviceName}</p>
          <p><span class="label">Firmware:</span> ${firmwareVersion}</p>
        </div>
      `;
    } else {
      const {
        name,
        ipAddress,
        model,
        serialNumber,
        firmwareVersion,
        channelId,
      } = nvrOrChannelDetails;

      return `
        <div class="section">
          <h3>Channel Details</h3>
          <p><span class="label">Name:</span> ${name}</p>
          <p><span class="label">Channel ID:</span> ${channelId}</p>
          <p><span class="label">IP Address:</span> ${ipAddress}</p>
          <p><span class="label">Model:</span> ${model}</p>
          <p><span class="label">Serial Number:</span> ${serialNumber}</p>
          <p><span class="label">Firmware:</span> ${firmwareVersion}</p>
        </div>
      `;
    }
  };

  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>Incident Report Notification</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f9f9f9;
        color: #333;
        padding: 20px;
      }
      .container {
        background: #ffffff;
        padding: 20px;
        border-radius: 8px;
        max-width: 600px;
        margin: auto;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
      }
      .header {
        border-bottom: 1px solid #ddd;
        padding-bottom: 10px;
        margin-bottom: 20px;
      }
      .section {
        margin-bottom: 15px;
      }
      .label {
        font-weight: bold;
      }
      .footer {
        margin-top: 20px;
        font-size: 12px;
        color: #888;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2>🚨 Incident Reported: ${incidentName} (${incidentType})</h2>
        <p><strong>Time:</strong> ${timeOfIncident}</p>
      </div>

      <div class="section">
        <p><span class="label">Description:</span> ${description}</p>
        <p><span class="label">Camera ID:</span> ${cameraId}</p>
        <p><span class="label">NVR ID:</span> ${nvrId}</p>
        <p><span class="label">Channel ID:</span> ${channelId}</p>
        <p><span class="label">Zone:</span> ${zone}</p>
        <p><span class="label">Severity:</span> ${severity}</p>
      </div>

      <div class="section">
        <p><strong>🎥 Video Link:</strong> <a href="${videoLink}" target="_blank">Watch Recording</a></p>
      </div>

      ${
        incidentType === "door_detection"
          ? `
      <div class="section">
        <p><span class="label">Duration Door Was Open:</span> ${durationOfOpen} seconds</p>
      </div>
      `
          : ""
      }

      ${
        incidentType === "uniform_detection"
          ? `
      <div class="section">
        <p><span class="label">No Uniform:</span> ${noUniformCount}</p>
        <p><span class="label">Partial Uniform:</span> ${partialUniformCount}</p>
        <p><span class="label">Incorrect Uniform:</span> ${incorrectUniformCount}</p>
        <p><span class="label">Total Persons:</span> ${totalPersons}</p>
        <p><span class="label">Detection Zone:</span> ${detectionZone}</p>
      </div>
      `
          : ""
      }

      ${
        incidentType === "zone_violation"
          ? `
      <div class="section">
        <p><span class="label">Violated Persons:</span> ${violatedPersonsCount}</p>
        <p><span class="label">Period of Violation:</span> ${periodOfViolation}</p>
      </div>
      `
          : ""
      }

      ${
        incidentType === "person_presence"
          ? `
      <div class="section">
        <p><span class="label">Absence Duration:</span> ${absenceDuration} minutes</p>
        <p><span class="label">Absent Persons:</span> ${personsAbsent}</p>
        <p><span class="label">Names:</span> ${(absentPersonsName || []).join(", ")}</p>
      </div>
      `
          : ""
      }

      ${
        incidentType === "traffic_violation"
          ? `
      <div class="section">
        <p><span class="label">Vehicle Number:</span> ${vehicleNumber}</p>
        <p><span class="label">Vehicle Type:</span> ${vehicleType}</p>
      </div>
      `
          : ""
      }

      ${renderDeviceDetails()}

      <div class="footer">
        <p>Incident Report System – ${userId}</p>
      </div>
    </div>
  </body>
  </html>`;
};

export let loiteringWithoutAuthTemplate = (
  incidentData,
  nvrData,
  channelData,
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    videoLink,
    description,
    Image,
    loiteringThreshold,
    _id,
  } = incidentData;

  const getSeverityStyles = (level) => {
    switch (level) {
      case "high":
        return { bgColor: "#FFDBD9", textColor: "#CE241C", label: "High" };
      case "moderate":
        return { bgColor: "#FFE4C5", textColor: "#ED9C2F", label: "Moderate" };
      case "low":
        return { bgColor: "#E5EAFF", textColor: "#3853C0", label: "Low" };
      default:
        return {
          bgColor: "#f0f0f0",
          textColor: "#333333",
          label: level || "N/A",
        };
    }
  };

  const { bgColor, textColor, label } = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
  });

  return `
  <!DOCTYPE html>
  <html>
  <head>
  <title>Loitering Report</title>
  <meta charset="UTF-8">
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Poppins, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4; padding:20px 0;">
  <tr>
  <td align="center">
  
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Logo -->
  <tr>
  <td align="center" style="padding:20px 0;">
  <img src="https://i.postimg.cc/ryCwbgMJ/Videora_IQlogo.png" alt="VideralQ" style="max-width:200px; display:block;">
  </td>
  </tr>
  
  <!-- Incident Icon -->
  <tr>
  <td align="center" style="padding:10px;">
  <table width="80" height="80" cellpadding="0" cellspacing="0" border="0" style="background:#ffe5e5; border-radius:50%; text-align:center;">
  <tr>
  <td align="center">
  <img src="https://i.postimg.cc/66LpSztK/loitering_Without_Auth.png" alt="Incident" style="width:60px;">
  </td>
  </tr>
  </table>
  </td>
  </tr>
  
  <!-- Title -->
  <tr>
  <td align="center" style="padding:6px 20px;">
  <h2 style="margin:0; font-size:20px; color:#333333; font-weight:500; font-family:Poppins, Arial, sans-serif;">
  Loitering without authorization - <span style="color:red;">Incident Report</span>
  </h2>
  </td>
  </tr>
  
  <!-- Main Container with All Details -->
  <tr>
  <td style="padding:20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e5e5; border-radius:6px; font-size:14px; color:#333333; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Incident Details Title -->
  <tr>
  <td colspan="2" style="padding:15px;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px;">Incident Details</h3>
  </td>
  </tr>
  
  <tr>
  <td width="50%" valign="top" style="padding:6px 10px;">
  <img src="https://i.postimg.cc/J0q7k7PJ/Edit.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Incident Name</strong></span>
  </td>
  <td style="padding:6px 10px; color: #626262;">${incidentName}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/MHDZQZdQ/descr.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Description</strong></span>
  </td>
  <td style="padding:6px 10px; color: #626262;">${description}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/SRrQMQD9/clock.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Time of Incident</strong></span>
  </td>
  <td style="padding:6px 10px; color: #626262;">${formattedTime}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Kcr8VQxQ/zone.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Zone</strong></span>
  </td>
  <td style="padding:6px 10px; color: #626262;">${zone}</td>
  </tr>
  
  <!-- Dynamic Severity -->
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/pVYL7kRn/Severity.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Severity</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <span style="background:${bgColor};font-size: 14px; color:${textColor}; padding:4px 20px; border-radius:4px; font-weight: 500;">${label}</span>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/1XHRqRJB/hour_glass.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Loitering Threshold</strong></span>
  </td>
  <td style="padding:6px 10px; color: #626262;">${loiteringThreshold} Seconds</td>
  </tr>
  
  <!-- Channel Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px;">Channel Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBc/cam.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" alt="" width="10" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/streams/camera-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline;">${channelData?.name || "N/A"}</a>
  </td>
  </tr>
  
  <!-- NVR Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px;">NVR Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/fWjRF5D3/Person.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" width="10" alt="" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/nvr-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline;">${nvrData?.nvrName || "N/A"}</a>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/rsJyryQh/IP.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>IP</strong></span>
  </td>
  <td style="padding:6px 10px; color: #626262;">"${decrypt(nvrData?.ip) || "N/A"}"</td>
  </tr>
  
  <!-- Media and Buttons -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px;">Media</h3>
  </td>
  </tr>
  <tr>
  <td colspan="2" style="padding:15px;" align="center">
  <img src="${Image}" alt="Incident Image" style="max-width:100%; border-radius:10px; display:block;">
  <br><br>
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
  <td align="left">
  <a href="${videoLink}" target="_blank" style="display:inline-flex; align-items:center; padding:8px 18px; background:#ffffff; color:#07486A; text-decoration:none; border:1px solid #07486A; border-radius:35px; font-size:14px;">
      <span style=" margin-right:8px;">
          <img src="https://i.postimg.cc/mZNgqVBt/play.png" width="20" alt="" style="display:block;">
      </span>
      Watch Video
  </a>
  </td>
  <td align="right">
  <a href="${config.get("webUrl") + "/incidents?incidentId=" + _id}" style="display:inline-block; padding:10px 20px; background:#07486A; color:#ffffff; text-decoration:none; border-radius:36px;">Login to your account</a>
  </td>
  </tr>
  </table>
  </td>
  </tr>
  
  </table>
  </td>
  </tr>
  
  </table>
  
  </td>
  </tr>
  </table>
  </body>
  </html>
  `;
};

export let LoiteringWithAuthIncident = (incidentData, nvrData, channelData) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    videoLink,
    personDetected,
    description,
    Image,
    loiteringThreshold,
    _id,
  } = incidentData;

  const getSeverityStyles = (level) => {
    switch (level) {
      case "high":
        return { bgColor: "#FFDBD9", textColor: "#CE241C", label: "High" };
      case "moderate":
        return { bgColor: "#FFE4C5", textColor: "#ED9C2F", label: "Moderate" };
      case "low":
        return { bgColor: "#E5EAFF", textColor: "#3853C0", label: "Low" };
      default:
        return {
          bgColor: "#f0f0f0",
          textColor: "#333333",
          label: level || "N/A",
        };
    }
  };

  const { bgColor, textColor, label } = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
  });

  const personNames = personDetected.length
    ? personDetected.map((p) => `${p.firstName} ${p.lastName}`).join(", ")
    : "N/A";

  return `<!DOCTYPE html>
  <html>
  <head>
  <title>Loitering with authorization Report</title>
  <meta charset="UTF-8">
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Poppins, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4; padding:20px 0;">
  <tr>
  <td align="center">
  
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Logo -->
  <tr>
  <td align="center" style="padding:20px 0;">
  <img src="https://i.postimg.cc/ryCwbgMJ/Videora_IQlogo.png" alt="VideralQ" style="max-width:200px; display:block;">
  </td>
  </tr>
  
  <!-- Incident Icon -->
  <tr>
  <td align="center" style="padding:10px;">
  <table width="80" height="80" cellpadding="0" cellspacing="0" border="0" style="background:#ffe5e5; border-radius:50%; text-align:center;">
  <tr>
  <td align="center">
  <img src="https://i.postimg.cc/Hn2WyWBF/loitering_With_Auth.png" alt="Incident" style="width:60px;">
  </td>
  </tr>
  </table>
  </td>
  </tr>
  
  <!-- Title -->
  <tr>
  <td align="center" style="padding:6px 20px;">
  <h2 style="margin:0; font-size:20px; color:#333333; font-weight:500; font-family:Poppins, Arial, sans-serif;">
  Loitering with authorization - <span style="color:red;">Incident Report</span>
  </h2>
  </td>
  </tr>
  
  <!-- Main Container with All Details -->
  <tr>
  <td style="padding:20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e5e5; border-radius:6px; font-size:14px; color:#333333; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Incident Details Title -->
  <tr>
  <td colspan="2" style="padding:15px;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Incident Details</h3>
  </td>
  </tr>
  
  <!-- Incident Details Rows -->
  <tr>
  <td width="50%" valign="top" style="padding:6px 10px;">
  <img src="https://i.postimg.cc/J0q7k7PJ/Edit.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Incident Name</strong></span>
  </td>
  <td width="50%" style="padding:6px 10px; color: #626262; font-weight: 400;">${incidentName}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/MHDZQZdQ/descr.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Description</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${description}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/SRrQMQD9/clock.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Time of Incident</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${formattedTime}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Kcr8VQxQ/zone.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Zone</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${zone}</td>
  </tr>
  <!-- Dynamic Severity -->
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/pVYL7kRn/Severity.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Severity</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <span style="background:${bgColor};font-size: 14px; color:${textColor}; padding:4px 20px; border-radius:4px; font-weight: 500;">${label}</span>
  </td>
  </tr>
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/1XHRqRJB/hour_glass.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Loitering Threshold</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${loiteringThreshold} Seconds</td>
  </tr>
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/fWjRF5D3/Person.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Persons Detected</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${personNames}</td>
  </tr>
  
  <!-- Channel Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Channel Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBc/cam.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" alt="" width="10" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/streams/camera-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline; font-family:Poppins, Arial, sans-serif;">${channelData?.name || "N/A"}</a>
  </td>
  </tr>
  
  <!-- NVR Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">NVR Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/fWjRF5D3/Person.png" target="_blank" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" width="10" alt="" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/nvr-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline; font-family:Poppins, Arial, sans-serif;">${nvrData?.nvrName || "N/A"}</a>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/rsJyryQh/IP.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">IP</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">"${decrypt(nvrData?.ip) || "N/A"}"</td>
  </tr>
  
  <!-- Media and Buttons -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Media</h3>
  </td>
  </tr>
  <tr>
  <td colspan="2" style="padding:15px;" align="center">
  <img src="${Image}" alt="Incident Image" style="max-width:100%; border-radius:10px; display:block;">
  <br><br>
  
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
  <td align="left">
  <a href="${videoLink}" target="_blank" style="display:inline-flex; align-items:center; padding:8px 18px; background:#ffffff; color:#07486A; text-decoration:none; border:1px solid #07486A; border-radius:35px; font-family:Poppins, Arial, sans-serif; font-size:14px;">
      <span style=" margin-right:8px;">
          <img src="https://i.postimg.cc/mZNgqVBt/play.png" target="_blank" width="20" alt="" style="display:block;">
      </span>
      Watch Video
  </a>
  </td>
  <td align="right">
  <a href="${config.get("webUrl") + "/incidents?incidentId=" + _id}" target="_blank" style="display:inline-block; padding:10px 20px; background:#07486A; color:#ffffff; text-decoration:none; border-radius:36px; font-family:Poppins, Arial, sans-serif;">Login to your account</a>
  </td>
  </tr>
  </table>
  
  </td>
  </tr>
  
  </table>
  </td>
  </tr>
  
  </table>
  
  </td>
  </tr>
  </table>
  </body>
  </html>`;
};

export let unauthorizedAccessIncident = (
  incidentData,
  nvrData,
  channelData,
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    videoLink,
    personDetected,
    alertThreshold,
    description,
    Image,
    _id,
    unknownCount,
  } = incidentData;

  const getSeverityStyles = (level) => {
    switch (level) {
      case "high":
        return { bgColor: "#FFDBD9", textColor: "#CE241C", label: "High" };
      case "moderate":
        return { bgColor: "#FFE4C5", textColor: "#ED9C2F", label: "Moderate" };
      case "low":
        return { bgColor: "#E5EAFF", textColor: "#3853C0", label: "Low" };
      default:
        return {
          bgColor: "#f0f0f0",
          textColor: "#333333",
          label: level || "N/A",
        };
    }
  };

  const { bgColor, textColor, label } = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
  });

  const personNames = personDetected.length
    ? personDetected.map((p) => `${p.firstName} ${p.lastName}`).join(", ")
    : "N/A";

  return `<!DOCTYPE html>
  <html>
  <head>
  <title>Unauthorized Access Report</title>
  <meta charset="UTF-8">
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Poppins, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4; padding:20px 0;">
  <tr>
  <td align="center">
  
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Logo -->
  <tr>
  <td align="center" style="padding:20px 0;">
  <img src="https://i.postimg.cc/ryCwbgMJ/Videora_IQlogo.png" alt="VideralQ" style="max-width:200px; display:block;">
  </td>
  </tr>
  
  <!-- Incident Icon -->
  <tr>
  <td align="center" style="padding:10px;">
  <table width="80" height="80" cellpadding="0" cellspacing="0" border="0" style="background:#ffe5e5; border-radius:50%; text-align:center;">
  <tr>
  <td align="center">
  <img src="https://i.postimg.cc/J7czgKMJ/unauthorized_Access.png" alt="Incident" style="width:60px;">
  </td>
  </tr>
  </table>
  </td>
  </tr>
  
  <!-- Title -->
  <tr>
  <td align="center" style="padding:6px 20px;">
  <h2 style="margin:0; font-size:20px; color:#333333; font-weight:500; font-family:Poppins, Arial, sans-serif;">
  Unauthorized Access - <span style="color:red;">Incident Report</span>
  </h2>
  </td>
  </tr>
  
  <!-- Main Container with All Details -->
  <tr>
  <td style="padding:20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e5e5; border-radius:6px; font-size:14px; color:#333333; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Incident Details Title -->
  <tr>
  <td colspan="2" style="padding:15px;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Incident Details</h3>
  </td>
  </tr>
  
  <!-- Incident Details Rows -->
  <tr>
  <td width="50%" valign="top" style="padding:6px 10px;">
  <img src="https://i.postimg.cc/J0q7k7PJ/Edit.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Incident Name</strong></span>
  </td>
  <td width="50%" style="padding:6px 10px; color: #626262; font-weight: 400;">${incidentName}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/MHDZQZdQ/descr.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Description</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${description}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/SRrQMQD9/clock.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Time of Incident</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${formattedTime}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Kcr8VQxQ/zone.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Zone</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${zone}</td>
  </tr>
  <!-- Dynamic Severity -->
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/pVYL7kRn/Severity.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Severity</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <span style="background:${bgColor};font-size: 14px; color:${textColor}; padding:4px 20px; border-radius:4px; font-weight: 500;">${label}</span>
  </td>
  </tr>
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/fWjRF5D3/Person.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Unknown Persons Detected</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${unknownCount}</td>
  </tr>
  
  <!-- Channel Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Channel Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBc/cam.pnghttps://i.postimg.cc/65X1Bxwg/cam.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" alt="" width="10" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/streams/camera-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline; font-family:Poppins, Arial, sans-serif;">${channelData?.name || "N/A"}</a>
  </td>
  </tr>
  
  <!-- NVR Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">NVR Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/fWjRF5D3/Person.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" width="10" alt="" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/nvr-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline; font-family:Poppins, Arial, sans-serif;">${nvrData?.nvrName || "N/A"}</a>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/rsJyryQh/IP.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">IP</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">"${decrypt(nvrData?.ip) || "N/A"}"</td>
  </tr>
  
  <!-- Media and Buttons -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Incident Snapshot</h3>
  </td>
  </tr>
  <tr>
  <td colspan="2" style="padding:15px;" align="center">
  <img src="${config.get("ImageView") + Image}" alt="Incident Image" style="max-width:100%; border-radius:10px; display:block;">
  <br><br>
  
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
  <td align="right">
  <a href="${config.get("webUrl") + "/incidents?incidentId=" + _id}" target="_blank" style="display:inline-block; padding:10px 20px; background:#07486A; color:#ffffff; text-decoration:none; border-radius:36px; font-family:Poppins, Arial, sans-serif;">Login to your account</a>
  </td>
  </tr>
  </table>
  
  </td>
  </tr>
  
  </table>
  </td>
  </tr>
  
  </table>
  
  </td>
  </tr>
  </table>
  </body>
  </html>
  `;
};

export let LineCrossingAuthIncident = (incidentData, nvrData, channelData) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    videoLink,
    personDetected,
    atoB,
    btoA,
    alertThreshold,
    description,
    Image,
    _id,
  } = incidentData;

  const getSeverityStyles = (level) => {
    switch (level) {
      case "high":
        return { bgColor: "#FFDBD9", textColor: "#CE241C", label: "High" };
      case "moderate":
        return { bgColor: "#FFE4C5", textColor: "#ED9C2F", label: "Moderate" };
      case "low":
        return { bgColor: "#E5EAFF", textColor: "#3853C0", label: "Low" };
      default:
        return {
          bgColor: "#f0f0f0",
          textColor: "#333333",
          label: level || "N/A",
        };
    }
  };

  const { bgColor, textColor, label } = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
  });

  const personNames = personDetected.length
    ? personDetected.map((p) => `${p.firstName} ${p.lastName}`).join(", ")
    : "N/A";

  return `<!DOCTYPE html>
  <html>
  <head>
  <title>${personDetected?.length ? "Line Crossing With Auth" : "Generic Line Crossing"}</title>
  <meta charset="UTF-8">
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Poppins, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4; padding:20px 0;">
  <tr>
  <td align="center">
  
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Logo -->
  <tr>
  <td align="center" style="padding:20px 0;">
  <img src="https://i.postimg.cc/ryCwbgMJ/Videora_IQlogo.png" alt="VideralQ" style="max-width:200px; display:block;">
  </td>
  </tr>
  
  <!-- Incident Icon -->
  <tr>
  <td align="center" style="padding:10px;">
  <table width="80" height="80" cellpadding="0" cellspacing="0" border="0" style="background:#ffe5e5; border-radius:50%; text-align:center;">
  <tr>
  <td align="center">
  <img src="https://i.postimg.cc/yxP6Z6vQ/line_Crossing.png" alt="Incident" style="width:60px;">
  </td>
  </tr>
  </table>
  </td>
  </tr>
  
  <!-- Title -->
  <tr>
  <td align="center" style="padding:6px 20px;">
  <h2 style="margin:0; font-size:20px; color:#333333; font-weight:500; font-family:Poppins, Arial, sans-serif;">
  Line Crossing - <span style="color:red;">Incident Report</span>
  </h2>
  </td>
  </tr>
  
  <!-- Main Container with All Details -->
  <tr>
  <td style="padding:20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e5e5; border-radius:6px; font-size:14px; color:#333333; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Incident Details Title -->
  <tr>
  <td colspan="2" style="padding:15px;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Incident Details</h3>
  </td>
  </tr>
  
  <!-- Incident Details Rows -->
  <tr>
  <td width="50%" valign="top" style="padding:6px 10px;">
  <img src="https://i.postimg.cc/J0q7k7PJ/Edit.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Incident Name</strong></span>
  </td>
  <td width="50%" style="padding:6px 10px; color: #626262; font-weight: 400;">${incidentName}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/MHDZQZdQ/descr.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Description</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${description}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/SRrQMQD9/clock.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Time of Incident</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${formattedTime}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Kcr8VQxQ/zone.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Zone</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${zone}</td>
  </tr>
  <!-- Dynamic Severity -->
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/pVYL7kRn/Severity.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Severity</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <span style="background:${bgColor};font-size: 14px; color:${textColor}; padding:4px 20px; border-radius:4px; font-weight: 500;">${label}</span>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/1XHRqRJB/hour_glass.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Alert Threshold</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${alertThreshold} Seconds</td>
  </tr>
${
  personDetected?.length
    ? `
<tr>
  <td style="padding:6px 10px;">
    <img src="https://i.postimg.cc/fWjRF5D3/Person.png" width="24" alt="" style="vertical-align:middle;"> 
    <span style="margin-left:6px;">
      <strong style="color:#333333;">Persons Detected</strong>
    </span>
  </td>
  <td style="padding:6px 10px;color:#626262;font-weight:400;">
    ${personNames}
  </td>
</tr>
`
    : `
<tr>
  <td style="padding:6px 10px;">
    <span style="font-size:18px;font-weight:600;color:#07486A;vertical-align:middle;">
      A → B
    </span>
    <span style="margin-left:8px;">
      <strong style="color:#333333;">Crossings</strong>
    </span>
  </td>
  <td style="padding:6px 10px;color:#626262;font-weight:400;">
    ${atoB}
  </td>
</tr>

<tr>
  <td style="padding:6px 10px;">
    <span style="font-size:18px;font-weight:600;color:#07486A;vertical-align:middle;">
      B → A
    </span>
    <span style="margin-left:8px;">
      <strong style="color:#333333;">Crossings</strong>
    </span>
  </td>
  <td style="padding:6px 10px;color:#626262;font-weight:400;">
    ${btoA}
  </td>
</tr>
`
}

  
  
  <!-- Channel Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Channel Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBc/cam.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" alt="" width="10" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/streams/camera-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline; font-family:Poppins, Arial, sans-serif;">${channelData?.name || "N/A"}</a>
  </td>
  </tr>
  
  <!-- NVR Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">NVR Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/fWjRF5D3/Person.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" width="10" alt="" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/nvr-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline; font-family:Poppins, Arial, sans-serif;">${nvrData?.nvrName || "N/A"}</a>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/rsJyryQh/IP.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">IP</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">"${decrypt(nvrData?.ip) || "N/A"}"</td>
  </tr>
  
  <!-- Media and Buttons -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Media</h3>
  </td>
  </tr>
  <tr>
  <td colspan="2" style="padding:15px;" align="center">
  <img src="${Image}" alt="Incident Image" style="max-width:100%; border-radius:10px; display:block;">
  <br><br>
  
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
  <td align="left">
  <a href="${videoLink}" target="_blank" style="display:inline-flex; align-items:center; padding:8px 18px; background:#ffffff; color:#07486A; text-decoration:none; border:1px solid #07486A; border-radius:35px; font-family:Poppins, Arial, sans-serif; font-size:14px;">
      <span style=" margin-right:8px;">
          <img src="https://i.postimg.cc/mZNgqVBt/play.png" width="20" alt="" style="display:block;">
      </span>
      Watch Video
  </a>
  </td>
  <td align="right">
  <a href="${config.get("webUrl") + "/incidents?incidentId=" + _id}" target="_blank" style="display:inline-block; padding:10px 20px; background:#07486A; color:#ffffff; text-decoration:none; border-radius:36px; font-family:Poppins, Arial, sans-serif;">Login to your account</a>
  </td>
  </tr>
  </table>
  
  </td>
  </tr>
  
  </table>
  </td>
  </tr>
  
  </table>
  
  </td>
  </tr>
  </table>
  </body>
  </html>
  `;
};

export let motionDetectionAuthTemplate = (
  incidentData,
  nvrData,
  channelData,
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    videoLink,
    description,
    Image,
    _id,
  } = incidentData;

  const getSeverityStyles = (level) => {
    switch (level) {
      case "high":
        return { bgColor: "#FFDBD9", textColor: "#CE241C", label: "High" };
      case "moderate":
        return { bgColor: "#FFE4C5", textColor: "#ED9C2F", label: "Moderate" };
      case "low":
        return { bgColor: "#E5EAFF", textColor: "#3853C0", label: "Low" };
      default:
        return {
          bgColor: "#f0f0f0",
          textColor: "#333333",
          label: level || "N/A",
        };
    }
  };

  const { bgColor, textColor, label } = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
  });

  return `<!DOCTYPE html>
  <html>
  <head>
  <title>Incident Report</title>
  <meta charset="UTF-8">
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Poppins, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4; padding:20px 0;">
  <tr>
  <td align="center">
  
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Logo -->
  <tr>
  <td align="center" style="padding:20px 0;">
  <img src="https://i.postimg.cc/ryCwbgMJ/Videora_IQlogo.png" alt="VideralQ" style="max-width:200px; display:block;">
  </td>
  </tr>
  
  <!-- Incident Icon -->
  <tr>
  <td align="center" style="padding:10px;">
  <table width="80" height="80" cellpadding="0" cellspacing="0" border="0" style="background:#ffe5e5; border-radius:50%; text-align:center;">
  <tr>
  <td align="center">
  <img src="https://i.postimg.cc/DfdwD5nf/motion_Detection.png" alt="Incident" style="width:40px;">
  </td>
  </tr>
  </table>
  </td>
  </tr>
  
  <!-- Title -->
  <tr>
  <td align="center" style="padding:6px 20px;">
  <h2 style="margin:0; font-size:20px; color:#333333; font-weight:500; font-family:Poppins, Arial, sans-serif;">
  Motion Detection - <span style="color:red;">Incident Report</span>
  </h2>
  </td>
  </tr>
  
  <!-- Main Container with All Details -->
  <tr>
  <td style="padding:20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e5e5; border-radius:6px; font-size:14px; color:#333333; font-family:Poppins, Arial, sans-serif;">
  
  <!-- Incident Details Title -->
  <tr>
  <td colspan="2" style="padding:15px;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Incident Details</h3>
  </td>
  </tr>
  
  <!-- Incident Details Rows -->
  <tr>
  <td width="50%" valign="top" style="padding:6px 10px;">
  <img src="https://i.postimg.cc/J0q7k7PJ/Edit.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Incident Name</strong></span>
  </td>
  <td width="50%" style="padding:6px 10px; color: #626262; font-weight: 400;">${incidentName}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/MHDZQZdQ/descr.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Description</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${description}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/SRrQMQD9/clock.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Time of Incident</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${formattedTime}</td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Kcr8VQxQ/zone.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Zone</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">${zone}</td>
  </tr>
  
  <!-- Dynamic Severity -->
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/pVYL7kRn/Severity.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong>Severity</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <span style="background:${bgColor};font-size: 14px; color:${textColor}; padding:4px 20px; border-radius:4px; font-weight: 500;">${label}</span>
  </td>
  </tr>
  
  <!-- Channel Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Channel Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBc/cam.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" alt="" width="10" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/streams/camera-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline; font-family:Poppins, Arial, sans-serif;">${channelData?.name || "N/A"}</a>
  </td>
  </tr>
  
  <!-- NVR Details Title -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">NVR Details</h3>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/fWjRF5D3/Person.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">Name</strong></span>
  </td>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/Hn2WyWBK/link.png" width="10" alt="" style="vertical-align:middle; margin-right:4px;">
  <a href="${config.get("webUrl") + "/nvr-settings"}" target="_blank" style="color:#1d4ed8; text-decoration:underline; font-family:Poppins, Arial, sans-serif;">${nvrData?.nvrName || "N/A"}</a>
  </td>
  </tr>
  
  <tr>
  <td style="padding:6px 10px;">
  <img src="https://i.postimg.cc/rsJyryQh/IP.png" width="24" alt="" style="vertical-align:middle;"> 
  <span style="margin-left:6px;"><strong style="color: #333333;">IP</strong></span>
  </td>
  <td style="padding:6px 10px;color: #626262; font-weight: 400;">"${decrypt(nvrData?.ip) || "N/A"}"</td>
  </tr>
  
  <!-- Media and Buttons -->
  <tr>
  <td colspan="2" style="padding:15px; border-top:1px solid #e5e5e5;">
  <h3 style="margin:0 0 10px 0; color:#07486A; font-size:16px; font-family:Poppins, Arial, sans-serif;">Media</h3>
  </td>
  </tr>
  <tr>
  <td colspan="2" style="padding:15px;" align="center">
  <img src="${Image}" alt="Incident Image" style="max-width:100%; border-radius:10px; display:block;">
  <br><br>
  
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
  <td align="left">
  <a href="${videoLink}" target="_blank" style="display:inline-flex; align-items:center; padding:8px 18px; background:#ffffff; color:#07486A; text-decoration:none; border:1px solid #07486A; border-radius:35px; font-family:Poppins, Arial, sans-serif; font-size:14px;white-space: nowrap;">
      <span style=" margin-right:8px;">
          <img src="https://i.postimg.cc/xTf1SH1w/exm1.png" width="20" alt="" style="display:block;">
      </span>
      Watch Video
  </a>
  </td>
  <td align="right">
  <a href="${config.get("webUrl") + "/incidents?incidentId=" + _id}" target="_blank" style="display:inline-block; padding:10px 20px; background:#07486A; color:#ffffff; text-decoration:none; border-radius:36px; font-family:Poppins, Arial, sans-serif;white-space: nowrap;">Login to your account</a>
  </td>
  </tr>
  </table>
  
  </td>
  </tr>
  
  </table>
  </td>
  </tr>
  
  </table>
  
  </td>
  </tr>
  </table>
  </body>
  </html>
  `;
};

export const verifyEmailTemplate = (verificationUrl) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Verify Your Email</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f5f7fa;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          h2 {
            color: #333333;
          }
          p {
            font-size: 16px;
            color: #555555;
          }
          .verify-button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #2e7dff;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-size: 16px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            font-size: 12px;
            color: #999999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Email Verification</h2>
          <p>Hello,</p>
          <p>Please click the button below to verify your email address:</p>
          <a href="${config.get("verificationLink")}${verificationUrl}" class="verify-button">Verify Email</a>
          <p>This link is valid for 10 minutes. Please do not share it with anyone.</p>
          <p>If you did not request this verification, please ignore this message.</p>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Your Company. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;
};

export let genericObjectDetectionTemplate = (
  incidentData,
  nvrData,
  channelData,
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    videoLink,
    description,
    Image,
    _id,
  } = incidentData;

  const getSeverityStyles = (level) => {
    switch (level) {
      case "high":
        return { bgColor: "#FFDBD9", textColor: "#CE241C", label: "High" };
      case "moderate":
        return { bgColor: "#FFE4C5", textColor: "#ED9C2F", label: "Moderate" };
      case "low":
        return { bgColor: "#E5EAFF", textColor: "#3853C0", label: "Low" };
      default:
        return {
          bgColor: "#f0f0f0",
          textColor: "#333333",
          label: level || "N/A",
        };
    }
  };

  const { bgColor, textColor, label } = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
  });

  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Generic Object Detection Report</title>
    <style>
      body { font-family: Arial; background: #f4f4f4; padding: 20px; }
      .card { background: #fff; padding: 20px; border-radius: 8px; max-width: 600px; margin: auto; }
      h2 { color: #007bff; }
      .section { margin-bottom: 10px; }
      .label { font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Generic Object Detection Report</h2>
  
      <div class="section"><span class="label">Incident Type:</span> genericObjectDetection</div>
      <div class="section"><span class="label">Time of Incident:</span> ${incidentData.timeOfIncident}</div>
      <div class="section"><span class="label">Zone:</span> ${incidentData.zone}</div>
  
      <div class="section"><span class="label">Objects Detected:</span>
        <ul>
          ${incidentData.objectsDetected
            .map((obj) => {
              const [key, value] = Object.entries(obj)[0];
              return `<li>${key}: ${value}</li>`;
            })
            .join("")}
        </ul>
      </div>
  
      <div class="section"><span class="label">Description:</span> ${incidentData.description || "N/A"}</div>
  
      <div class="section">
            <h3>Incident Snapshot</h3>

            ${
              Image
                ? `
              <div class="image-box">
                <img
                  src="${config.get("webUrl") + "/api/v1/uploads" + Image}"
                  alt="Incident Image"
                />
              </div>
              `
                : `
              <div class="no-image">
                No incident image available
              </div>
              `
            }
          </div>
    </div>
  </body>
  </html>`;
};

export let countVehiclesTemplate = (incidentData, nvrData, channelData) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    videoLink,
    description,
    Image,
    _id,
  } = incidentData;

  const getSeverityStyles = (level) => {
    switch (level) {
      case "high":
        return { bgColor: "#FFDBD9", textColor: "#CE241C", label: "High" };
      case "moderate":
        return { bgColor: "#FFE4C5", textColor: "#ED9C2F", label: "Moderate" };
      case "low":
        return { bgColor: "#E5EAFF", textColor: "#3853C0", label: "Low" };
      default:
        return {
          bgColor: "#f0f0f0",
          textColor: "#333333",
          label: level || "N/A",
        };
    }
  };

  const { bgColor, textColor, label } = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
  });

  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Vehicle Count Report</title>
    <style>
      body { font-family: Arial; background: #f4f4f4; padding: 20px; }
      .card { background: #fff; padding: 20px; border-radius: 8px; max-width: 600px; margin: auto; }
      h2 { color: #dc3545; }
      .section { margin-bottom: 10px; }
      .label { font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Vehicle Count Report</h2>
  
      <div class="section"><span class="label">Incident Type:</span> countVehicles</div>
      <div class="section"><span class="label">Time of Incident:</span> ${incidentData.timeOfIncident}</div>
      <div class="section"><span class="label">Zone:</span> ${incidentData.zone}</div>
  
      <div class="section"><span class="label">Vehicles Counted:</span> ${incidentData.count}</div>
  
      <div class="section"><span class="label">Description:</span> ${incidentData.description || "N/A"}</div>
  
      <div class="section"><span class="label">Video Link:</span> <a href="${incidentData.videoLink}" target="_blank">Watch Video</a></div>
    </div>
  </body>
  </html>`;
};

export const crowdDetectionTemplate = (incidentData, nvrData, channelData) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
    count,
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const severityStyle = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>People Detection Incident Report</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp"
                   alt="VideoraIQ"
                   style="max-width:200px;display:block;">
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">Crowd Detection Alert</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
                Automated Incident Notification
              </p>
            </td>
          </tr>

          <!-- Incident Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Incident Type:</strong> ${
                      incidentName || "Crowd Detection"
                    }
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Zone:</strong> ${zone || "N/A"}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Incident:</strong> ${formattedTime}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${severityStyle.bg};
                      color:${severityStyle.text};
                      font-weight:bold;">
                      Severity: ${severityStyle.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Crowd Summary -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                People Detection Summary
              </h3>
              
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
                <tr>
                  <td style="padding:16px;font-size:14px;color:#0F172A;">
                    <strong>Total People Detected:</strong>
                    <span style="
                      font-size:18px;
                      font-weight:bold;
                      color:#1D4ED8;
                      margin-left:6px;
                    ">
                      ${count ?? 0}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Incident Image -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Incident Snapshot
              </h3>

              ${
                Image
                  ? `
                <img 
                  src="${config.get("ImageView") + Image}"
                  alt="Incident Image"
                  width="100%"
                  style="
                    max-width:552px;
                    border-radius:8px;
                    border:1px solid #E2E8F0;
                    display:block;
                  "
                />`
                  : `
                <div style="
                  padding:20px;
                  text-align:center;
                  font-size:14px;
                  color:#64748B;
                  border:1px dashed #CBD5E1;
                  border-radius:6px;
                ">
                  No incident image available
                </div>`
              }
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:0 24px 24px;">
              <strong>Description:</strong>
              <p style="margin:6px 0 0;font-size:14px;color:#334155;">
                ${description || "No additional description provided."}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const countPersonsTemplate = (incidentData, nvrData, channelData) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
    count,
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const severityStyle = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>People Detection Incident Report</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp"
                   alt="VideoraIQ"
                   style="max-width:200px;display:block;">
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">Crowd Detection Alert</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
                Automated Incident Notification
              </p>
            </td>
          </tr>

          <!-- Incident Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Incident Type:</strong> ${
                      incidentName || "Crowd Detection"
                    }
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Zone:</strong> ${zone || "N/A"}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Incident:</strong> ${formattedTime}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${severityStyle.bg};
                      color:${severityStyle.text};
                      font-weight:bold;">
                      Severity: ${severityStyle.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Crowd Summary -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                People Detection Summary
              </h3>
              
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
                <tr>
                  <td style="padding:16px;font-size:14px;color:#0F172A;">
                    <strong>Total People Detected:</strong>
                    <span style="
                      font-size:18px;
                      font-weight:bold;
                      color:#1D4ED8;
                      margin-left:6px;
                    ">
                      ${count ?? 0}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Incident Image -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Incident Snapshot
              </h3>

              ${
                Image
                  ? `
                <img 
                  src="${config.get("ImageView") + Image}"
                  alt="Incident Image"
                  width="100%"
                  style="
                    max-width:552px;
                    border-radius:8px;
                    border:1px solid #E2E8F0;
                    display:block;
                  "
                />`
                  : `
                <div style="
                  padding:20px;
                  text-align:center;
                  font-size:14px;
                  color:#64748B;
                  border:1px dashed #CBD5E1;
                  border-radius:6px;
                ">
                  No incident image available
                </div>`
              }
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:0 24px 24px;">
              <strong>Description:</strong>
              <p style="margin:6px 0 0;font-size:14px;color:#334155;">
                ${description || "No additional description provided."}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const personalProtectiveEquipmentTemplate = (
  incidentData,
  nvrData,
  channelData,
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    _id,
    Image,
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const severityStyle = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  const latestPPE =
    incidentData?.timeSeries?.[incidentData.timeSeries.length - 1]?.ppe || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>PPE Detection Incident Report</title>
</head>


<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp" alt="VideralQ" style="max-width:200px; display:block;">
            </td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">PPE Detection Alert</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
                Automated Incident Notification
              </p>
            </td>
          </tr>

          <!-- Incident Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Incident Type:</strong> ${
                      incidentName || "Personal Protective Equipment"
                    }
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Zone:</strong> ${zone || "N/A"}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Incident:</strong> ${formattedTime}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${severityStyle.bg};
                      color:${severityStyle.text};
                      font-weight:bold;">
                      Severity: ${severityStyle.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- PPE Detection Summary -->
          <!-- PPE Detection Summary -->
<tr>
  <td style="padding:0 24px 24px;">
    <h3 style="font-size:16px;margin-bottom:14px;color:#0F172A;">
      PPE Detection Summary
    </h3>

              <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                <tr style="background:#F1F5F9;">
                  <th align="left" style="border:1px solid #E2E8F0;">PPE Type</th>
                  <th align="center" style="border:1px solid #E2E8F0;">Detected</th>
                  <th align="center" style="border:1px solid #E2E8F0;">Not Detected</th>
                </tr>
                ${
                  Object.keys(latestPPE).length
                    ? Object.entries(latestPPE)
                        .map(
                          ([key, val]) => `
                  <tr>
                    <td style="border:1px solid #E2E8F0;">${key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</td>
                    <td align="center" style="border:1px solid #E2E8F0;color:#15803D;">
                      ${val.yes ?? 0}
                    </td>
                    <td align="center" style="border:1px solid #E2E8F0;color:#B91C1C;">
                      ${val.no ?? 0}
                    </td>
                  </tr>`,
                        )
                        .join("")
                    : `
                  <tr>
                    <td colspan="3" align="center" style="border:1px solid #E2E8F0;">
                      No PPE data available
                    </td>
                  </tr>`
                }
              </table>
            </td>
          </tr>

          <!-- Incident Image -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Incident Snapshot
              </h3>

              ${
                Image
                  ? `
                <img 
                  src="${config.get("ImageView") + Image}"
                  alt="Incident Image"
                  width="100%"
                  style="
                    max-width:552px;
                    border-radius:8px;
                    border:1px solid #E2E8F0;
                    display:block;
                  "
                />`
                  : `
                <div style="
                  padding:20px;
                  text-align:center;
                  font-size:14px;
                  color:#64748B;
                  border:1px dashed #CBD5E1;
                  border-radius:6px;
                ">
                  No incident image available
                </div>`
              }
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:0 24px 24px;">
              <strong>Description:</strong>
              <p style="margin:6px 0 0;font-size:14px;color:#334155;">
                ${description || "No additional description provided."}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.  
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const doorDetectionTemplate = (incidentData, nvrData, channelData) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
    currentStatus, // OPENED | CLOSED
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const getDoorStatusStyles = (status = "CLOSED") => {
    if (status === "OPENED") {
      return {
        bg: "#FEE2E2",
        text: "#B91C1C",
        label: "OPENED",
      };
    }
    return {
      bg: "#DCFCE7",
      text: "#15803D",
      label: "CLOSED",
    };
  };

  const severityStyle = getSeverityStyles(severity);
  const doorStatusStyle = getDoorStatusStyles(currentStatus);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Door Detection Incident Report</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img 
                src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp" 
                alt="VideoraIQ" 
                style="max-width:200px;display:block;"
              >
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">Door Detection Alert</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
                Automated Incident Notification
              </p>
            </td>
          </tr>

          <!-- Incident Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Incident Type:</strong> ${
                      incidentName || "Door Detection"
                    }
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Zone:</strong> ${zone || "N/A"}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Incident:</strong> ${formattedTime}
                  </td>
                </tr>

                <tr>
                  <td style="padding-top:10px;">
                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${severityStyle.bg};
                      color:${severityStyle.text};
                      font-weight:bold;
                      margin-right:8px;
                    ">
                      Severity: ${severityStyle.label}
                    </span>

                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${doorStatusStyle.bg};
                      color:${doorStatusStyle.text};
                      font-weight:bold;
                    ">
                      Door Status: ${doorStatusStyle.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Incident Image -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Incident Snapshot
              </h3>

              ${
                Image
                  ? `
                <img 
                  src="${config.get("ImageView") + Image}"
                  alt="Door Incident Image"
                  width="100%"
                  style="
                    max-width:552px;
                    border-radius:8px;
                    border:1px solid #E2E8F0;
                    display:block;
                  "
                />`
                  : `
                <div style="
                  padding:20px;
                  text-align:center;
                  font-size:14px;
                  color:#64748B;
                  border:1px dashed #CBD5E1;
                  border-radius:6px;
                ">
                  No incident image available
                </div>`
              }
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:0 24px 24px;">
              <strong>Description:</strong>
              <p style="margin:6px 0 0;font-size:14px;color:#334155;">
                ${description || "No additional description provided."}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.  
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const lightDetectionTemplate = (incidentData, nvrData, channelData) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
    currentStatus, // ON | OFF
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const getLightStatusStyles = (status = "OFF") => {
    if (status === "ON") {
      return {
        bg: "#FEF9C3",
        text: "#A16207",
        label: "ON",
      };
    }
    return {
      bg: "#E5E7EB",
      text: "#374151",
      label: "OFF",
    };
  };

  const severityStyle = getSeverityStyles(severity);
  const lightStatusStyle = getLightStatusStyles(currentStatus);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Light Detection Incident Report</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img 
                src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp" 
                alt="VideoraIQ" 
                style="max-width:200px;display:block;"
              >
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">Light Detection Alert</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
                Automated Incident Notification
              </p>
            </td>
          </tr>

          <!-- Incident Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Incident Type:</strong> ${
                      incidentName || "Light Detection"
                    }
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Zone:</strong> ${zone || "N/A"}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Incident:</strong> ${formattedTime}
                  </td>
                </tr>

                <tr>
                  <td style="padding-top:10px;">
                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${severityStyle.bg};
                      color:${severityStyle.text};
                      font-weight:bold;
                      margin-right:8px;
                    ">
                      Severity: ${severityStyle.label}
                    </span>

                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${lightStatusStyle.bg};
                      color:${lightStatusStyle.text};
                      font-weight:bold;
                    ">
                      Light Status: ${lightStatusStyle.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Incident Image -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Incident Snapshot
              </h3>

              ${
                Image
                  ? `
                <img 
                  src="${config.get("ImageView") + Image}"
                  alt="Light Incident Image"
                  width="100%"
                  style="
                    max-width:552px;
                    border-radius:8px;
                    border:1px solid #E2E8F0;
                    display:block;
                  "
                />`
                  : `
                <div style="
                  padding:20px;
                  text-align:center;
                  font-size:14px;
                  color:#64748B;
                  border:1px dashed #CBD5E1;
                  border-radius:6px;
                ">
                  No incident image available
                </div>`
              }
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:0 24px 24px;">
              <strong>Description:</strong>
              <p style="margin:6px 0 0;font-size:14px;color:#334155;">
                ${description || "No additional description provided."}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.  
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export let bagDetectionTemplate = (incidentData, nvrData, channelData) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
    count,
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const severityStyle = getSeverityStyles(severity);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Bag Detection Alert</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp"
                   alt="VideoraIQ"
                   style="max-width:200px;display:block;">
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">Bag Detection Alert</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
                Automated Incident Notification
              </p>
            </td>
          </tr>

          <!-- Incident Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Incident Type:</strong> ${
                      incidentName || "Crowd Detection"
                    }
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Zone:</strong> ${zone || "N/A"}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Incident:</strong> ${formattedTime}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${severityStyle.bg};
                      color:${severityStyle.text};
                      font-weight:bold;">
                      Severity: ${severityStyle.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Crowd Summary -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                People with Bag Detected Summary
              </h3>
              
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
                <tr>
                  <td style="padding:16px;font-size:14px;color:#0F172A;">
                    <strong>Total People with Bag Detected:</strong>
                    <span style="
                      font-size:18px;
                      font-weight:bold;
                      color:#1D4ED8;
                      margin-left:6px;
                    ">
                      ${count ?? 0}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Incident Image -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Incident Snapshot
              </h3>

              ${
                Image
                  ? `
                <img 
                  src="${config.get("ImageView") + Image}"
                  alt="Incident Image"
                  width="100%"
                  style="
                    max-width:552px;
                    border-radius:8px;
                    border:1px solid #E2E8F0;
                    display:block;
                  "
                />`
                  : `
                <div style="
                  padding:20px;
                  text-align:center;
                  font-size:14px;
                  color:#64748B;
                  border:1px dashed #CBD5E1;
                  border-radius:6px;
                ">
                  No incident image available
                </div>`
              }
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:0 24px 24px;">
              <strong>Description:</strong>
              <p style="margin:6px 0 0;font-size:14px;color:#334155;">
                ${description || "No additional description provided."}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const vehicleDetectionTemplate = (
  incidentData,
  nvrData,
  channelData,
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
    vehicleNumber,
    currentStatus, // OPENED | CLOSED
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const getDoorStatusStyles = (status = "CLOSED") => {
    if (status === "OPENED") {
      return {
        bg: "#FEE2E2",
        text: "#B91C1C",
        label: "OPENED",
      };
    }
    return {
      bg: "#DCFCE7",
      text: "#15803D",
      label: "CLOSED",
    };
  };

  const severityStyle = getSeverityStyles(severity);
  const doorStatusStyle = getDoorStatusStyles(currentStatus);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Vehicle Detection Incident Report</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img 
                src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp" 
                alt="VideoraIQ" 
                style="max-width:200px;display:block;"
              >
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">Vehicle and Obstruction Alert</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
                Automated Incident Notification
              </p>
            </td>
          </tr>

          <!-- Incident Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Incident Type:</strong> ${incidentName || "Vehicle Detection"}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Zone:</strong> ${zone || "N/A"}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Incident:</strong> ${timeOfIncident}
                  </td>
                </tr>

                <tr>
                  <td style="padding-top:10px;">
                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${severityStyle.bg};
                      color:${severityStyle.text};
                      font-weight:bold;
                    ">
                      Severity: ${severityStyle.label}
                    </span>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Channel & NVR Details -->
          <tr>
            <td style="padding:0 24px 20px;">
              
              <!-- Channel -->
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Channel Details
              </h3>

              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                <tr>
                  <td style="padding-bottom:6px;">
                    <strong>Name:</strong> ${channelData?.name || "N/A"}
                  </td>
                </tr>
              </table>

              <!-- NVR -->
              <h3 style="font-size:16px;margin:16px 0 10px;color:#0F172A;">
                NVR Details
              </h3>

              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                <tr>
                  <td style="padding-bottom:6px;">
                    <strong>Name:</strong> ${nvrData?.nvrName || "N/A"}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:6px;">
                    <strong>IP:</strong> ${decrypt(nvrData?.ip) || "N/A"}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Incident Snapshot -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Incident Snapshot
              </h3>
              <img 
                src="${config.get("ImageView") + Image}"
                alt="Vehicle Incident Image"
                width="100%"
                style="
                  max-width:552px;
                  border-radius:8px;
                  border:1px solid #E2E8F0;
                  display:block;
                "
              />
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding:0 24px 20px;">
              <strong>Description:</strong>
              <p style="margin:6px 0 0;font-size:14px;color:#334155;">
                ${description || "No additional description provided."}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.  
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};


export const deskAbsenceTemplate = (
  incidentData,
  nvrData,
  channelData
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
    personPresent, // true | false
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const getPresenceStyles = (present) => {
    if (present) {
      return {
        bg: "#DCFCE7",
        text: "#15803D",
        label: "Person Present",
      };
    }

    return {
      bg: "#FEE2E2",
      text: "#B91C1C",
      label: "Desk Vacant",
    };
  };

  const severityStyle = getSeverityStyles(severity);
  const presenceStyle = getPresenceStyles(personPresent);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Desk Absence Incident Report</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<!-- Logo -->
<tr>
<td align="center" style="padding:20px 0;">
<img 
src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp"
alt="VideoraIQ"
style="max-width:200px;display:block;"
>
</td>
</tr>

<!-- Header -->
<tr>
<td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
<h2 style="margin:0;font-size:20px;">Desk Absence Alert</h2>
<p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
Automated Incident Notification
</p>
</td>
</tr>

<!-- Incident Summary -->
<tr>
<td style="padding:20px 24px;">
<table width="100%" cellpadding="0" cellspacing="0">

<tr>
<td style="font-size:14px;padding-bottom:6px;">
<strong>Incident Type:</strong> ${incidentName || "Desk Absence"}
</td>
</tr>

<tr>
<td style="font-size:14px;padding-bottom:6px;">
<strong>Zone:</strong> ${zone || "N/A"}
</td>
</tr>

<tr>
<td style="font-size:14px;padding-bottom:6px;">
<strong>Time of Incident:</strong> ${formattedTime}
</td>
</tr>

<tr>
<td style="padding-top:10px;">

<span style="
display:inline-block;
padding:6px 12px;
font-size:12px;
border-radius:20px;
background:${severityStyle.bg};
color:${severityStyle.text};
font-weight:bold;
margin-right:8px;
">
Severity: ${severityStyle.label}
</span>

<span style="
display:inline-block;
padding:6px 12px;
font-size:12px;
border-radius:20px;
background:${presenceStyle.bg};
color:${presenceStyle.text};
font-weight:bold;
">
${presenceStyle.label}
</span>

</td>
</tr>

</table>
</td>
</tr>

<!-- Incident Snapshot -->
<tr>
<td style="padding:0 24px 20px;">
<h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
Incident Snapshot
</h3>
<img 
src="${config.get("ImageView") + Image}"
alt="Desk Absence Image"
width="100%"
style="
max-width:552px;
border-radius:8px;
border:1px solid #E2E8F0;
display:block;
"
/>
</td>
</tr>

<!-- Description -->
<tr>
<td style="padding:0 24px 20px;">
<strong>Description:</strong>
<p style="margin:6px 0 0;font-size:14px;color:#334155;">
${description || "No additional description provided."}
</p>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
This is an automated system-generated alert.  
Please do not reply to this email.
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
};

export const guardAbsenceTemplate = (
  incidentData,
  nvrData,
  channelData
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
    personPresent, // true | false
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const getPresenceStyles = (present) => {
    if (present) {
      return {
        bg: "#DCFCE7",
        text: "#15803D",
        label: "Person Present",
      };
    }

    return {
      bg: "#FEE2E2",
      text: "#B91C1C",
      label: "Desk Vacant",
    };
  };

  const severityStyle = getSeverityStyles(severity);
  const presenceStyle = getPresenceStyles(personPresent);

  const formattedTime = new Date(timeOfIncident).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Guard Absence Incident Report</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

<!-- Logo -->
<tr>
<td align="center" style="padding:20px 0;">
<img 
src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp"
alt="VideoraIQ"
style="max-width:200px;display:block;"
>
</td>
</tr>

<!-- Header -->
<tr>
<td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
<h2 style="margin:0;font-size:20px;">Guard Absence Alert</h2>
<p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
Automated Incident Notification
</p>
</td>
</tr>

<!-- Incident Summary -->
<tr>
<td style="padding:20px 24px;">
<table width="100%" cellpadding="0" cellspacing="0">

<tr>
<td style="font-size:14px;padding-bottom:6px;">
<strong>Incident Type:</strong> ${incidentName || "Guard Absence"}
</td>
</tr>

<tr>
<td style="font-size:14px;padding-bottom:6px;">
<strong>Zone:</strong> ${zone || "N/A"}
</td>
</tr>

<tr>
<td style="font-size:14px;padding-bottom:6px;">
<strong>Time of Incident:</strong> ${formattedTime}
</td>
</tr>

<tr>
<td style="padding-top:10px;">

<span style="
display:inline-block;
padding:6px 12px;
font-size:12px;
border-radius:20px;
background:${severityStyle.bg};
color:${severityStyle.text};
font-weight:bold;
margin-right:8px;
">
Severity: ${severityStyle.label}
</span>

<span style="
display:inline-block;
padding:6px 12px;
font-size:12px;
border-radius:20px;
background:${presenceStyle.bg};
color:${presenceStyle.text};
font-weight:bold;
">
${presenceStyle.label}
</span>

</td>
</tr>

</table>
</td>
</tr>

<!-- Incident Snapshot -->
<tr>
<td style="padding:0 24px 20px;">
<h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
Incident Snapshot
</h3>
<img 
src="${config.get("ImageView") + Image}"
alt="Guard Absence Image"
width="100%"
style="
max-width:552px;
border-radius:8px;
border:1px solid #E2E8F0;
display:block;
"
/>
</td>
</tr>

<!-- Description -->
<tr>
<td style="padding:0 24px 20px;">
<strong>Description:</strong>
<p style="margin:6px 0 0;font-size:14px;color:#334155;">
${description || "No additional description provided."}
</p>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
This is an automated system-generated alert.  
Please do not reply to this email.
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
};






export const entryLogTemplate = (entryData, nvrData, channelData) => {
  const { user, event } = entryData;
  const { timestamp, images } = event;

  const formattedTime = new Date(timestamp).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  const imageBaseUrl = config.get("ImageView");

  const imageList = [
    { label: "Face Capture", value: images?.face },
    { label: "Person Capture", value: images?.person },
    { label: "Full Frame", value: images?.frame },
  ].filter((img) => img.value);

  const imagesHtml =
    imageList.length > 0
      ? imageList
          .map(
            (img) => `
            <tr>
              <td style="padding-bottom:16px;">
                <strong style="font-size:13px;color:#334155;">
                  ${img.label}
                </strong>
                <br/>
                <img 
                  src="${imageBaseUrl + img.value}"
                  alt="${img.label}"
                  width="100%"
                  style="
                    margin-top:6px;
                    max-width:552px;
                    border-radius:8px;
                    border:1px solid #E2E8F0;
                    display:block;
                  "
                />
              </td>
            </tr>
          `,
          )
          .join("")
      : `
        <tr>
          <td style="font-size:14px;color:#64748B;">
            No image available.
          </td>
        </tr>
      `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Entry Log Notification</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img 
                src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp" 
                alt="VideoraIQ" 
                style="max-width:200px;display:block;"
              >
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">Entry Log Alert</h2>
            </td>
          </tr>

          <!-- Entry Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Name:</strong> 
                    ${user?.firstName || ""} ${user?.lastName || ""}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Entry:</strong> 
                    ${formattedTime}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Camera:</strong> 
                    ${channelData?.name || "N/A"}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>NVR:</strong> 
                    ${nvrData?.nvrName || "N/A"}
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Snapshot Section -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Entry Snapshots
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${imagesHtml}
              </table>
            </td>
          </tr>

          

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.  
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const vehicleLogTemplate = (entryData, nvrData, channelData) => {
  const { vehicle, event } = entryData;
  const { timestamp, images } = event;

  const formattedTime = new Date(timestamp).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  const imageBaseUrl = config.get("ImageView");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Vehicle Entry Notification</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:20px 0;">
              <img 
                src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp" 
                alt="VideoraIQ" 
                style="max-width:200px;display:block;"
              >
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">Vehicle Entry Alert</h2>
            </td>
          </tr>

          <!-- Entry Summary -->
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Vehicle Number:</strong> 
                    ${vehicle?.vehicleNumber || "N/A"}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Entry:</strong> 
                    ${formattedTime}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Camera:</strong> 
                    ${channelData?.name || "N/A"}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>NVR:</strong> 
                    ${nvrData?.nvrName || "N/A"}
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Snapshot Section -->
          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">
                Vehicle Snapshot
              </h3>
              ${
                images?.vehicle
                  ? `
                <img
                  src="${imageBaseUrl + images.vehicle}"
                  alt="Vehicle Image"
                  width="100%"
                  style="
                    max-width:552px;
                    border-radius:8px;
                    border:1px solid #E2E8F0;
                    display:block;
                  "
                />`
                  : `<p style="font-size:14px;color:#64748B;">No image available.</p>`
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const industrialEquipmentTemplate = (
  equipmentLabel,
  incidentData,
  nvrData,
  channelData,
) => {
  const {
    incidentName,
    timeOfIncident,
    zone,
    severity,
    description,
    Image,
  } = incidentData;

  const getSeverityStyles = (level = "low") => {
    switch (level) {
      case "high":
        return { bg: "#FDECEA", text: "#B42318", label: "High" };
      case "moderate":
        return { bg: "#FFF4E5", text: "#B54708", label: "Moderate" };
      case "low":
      default:
        return { bg: "#E8F1FF", text: "#1D4ED8", label: "Low" };
    }
  };

  const severityStyle = getSeverityStyles(severity);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${equipmentLabel} Incident Report</title>
</head>

<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <tr>
            <td align="center" style="padding:20px 0;">
              <img
                src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp"
                alt="VideoraIQ"
                style="max-width:200px;display:block;"
              >
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px;background:#0F172A;color:#ffffff;">
              <h2 style="margin:0;font-size:20px;">${equipmentLabel} Alert</h2>
              <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">
                Automated Incident Notification
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Incident Type:</strong> ${incidentName || equipmentLabel}
                  </td>
                </tr>
               
                <tr>
                  <td style="font-size:14px;padding-bottom:6px;">
                    <strong>Time of Incident:</strong> ${timeOfIncident}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <span style="
                      display:inline-block;
                      padding:6px 12px;
                      font-size:12px;
                      border-radius:20px;
                      background:${severityStyle.bg};
                      color:${severityStyle.text};
                      font-weight:bold;
                    ">
                      Severity: ${severityStyle.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">Channel Details</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                <tr>
                  <td style="padding-bottom:6px;">
                    <strong>Name:</strong> ${channelData?.name || "N/A"}
                  </td>
                </tr>
              </table>

              <h3 style="font-size:16px;margin:16px 0 10px;color:#0F172A;">NVR Details</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                <tr>
                  <td style="padding-bottom:6px;">
                    <strong>Name:</strong> ${nvrData?.nvrName || "N/A"}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 20px;">
              <h3 style="font-size:16px;margin-bottom:10px;color:#0F172A;">Incident Snapshot</h3>
              ${
                Image
                  ? `<img
                src="${config.get("ImageView") + Image}"
                alt="${equipmentLabel} Incident Image"
                width="100%"
                style="max-width:552px;border-radius:8px;border:1px solid #E2E8F0;display:block;"
              />`
                  : `<p style="font-size:14px;color:#64748B;">No image available.</p>`
              }
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 20px;">
              <strong>Description:</strong>
              <p style="margin:6px 0 0;font-size:14px;color:#334155;">
                ${description || "No additional description provided."}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#64748B;">
              This is an automated system-generated alert.
              Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const conveyorDetectionTemplate = (incidentData, nvrData, channelData) =>
  industrialEquipmentTemplate(
    "Conveyor Detection",
    incidentData,
    nvrData,
    channelData,
  );

export const crusherDetectionTemplate = (incidentData, nvrData, channelData) =>
  industrialEquipmentTemplate(
    "Crusher Detection",
    incidentData,
    nvrData,
    channelData,
  );

export const waterSpillageDetectionTemplate = (
  incidentData,
  nvrData,
  channelData,
) =>
  industrialEquipmentTemplate(
    "Water Spillage Detection",
    incidentData,
    nvrData,
    channelData,
  );

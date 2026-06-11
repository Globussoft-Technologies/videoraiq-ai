import React from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const routeTitles = {
  "/": "VideoraIQ | Dashboard",
  "/dashboard": "Dashboard | VideoraIQ",
  '/incidents': "Incidents | VideoraIQ",
  '/nvr-settings': "NVR-Settings | VideoraIQ",
  "/cameraview": "Live-Streaming | VideoraIQ",
  "/Playback": "Playback | VideoraIQ",
  "/detection-settings": "Detection-Settings | VideoraIQ",
  "/notification-recipients": "Alert-Recipients | VideoraIQ",
  "/active-cameras": "Active-Cameras | VideoraIQ",
  "/critical-incidents": "Critical-Incidents | VideoraIQ",
  "/total-incidents": "Total-Incidents | VideoraIQ",
  "/incidents-resolved": "Resolved-Incidents | VideoraIQ",
  "/streams/camera-settings": "Camera-Settings | VideoraIQ",
  "/locations": "Locations | VideoraIQ",
  "/departments": "Departments | VideoraIQ",
};

export default function TitleUpdater() {
  const location = useLocation();

  useEffect(() => {
    const currentPath = location.pathname;
    const pageTitle = routeTitles[currentPath] || "VideoraIQ";
    document.title = pageTitle;
  }, [location]);

  return null;
}

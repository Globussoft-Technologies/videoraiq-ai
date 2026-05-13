import React from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const routeTitles = {
  "/": "VideoralQ | Dashboard",
  "/dashboard": "Dashboard | VideoralQ",
  '/incidents': "Incidents | VideoralQ",
  '/nvr-settings': "NVR-Settings | VideoralQ",
  "/cameraview": "Live-Streaming | VideoralQ",
  "/Playback": "Playback | VideoralQ",
  "/detection-settings": "Detection-Settings | VideoralQ",
  "/notification-recipients": "Alert-Recipients | VideoralQ",
  "/active-cameras": "Active-Cameras | VideoralQ",
  "/critical-incidents": "Critical-Incidents | VideoralQ",
  "/total-incidents": "Total-Incidents | VideoralQ",
  "/incidents-resolved": "Resolved-Incidents | VideoralQ",
  "/streams/camera-settings": "Camera-Settings | VideoralQ",
};

export default function TitleUpdater() {
  const location = useLocation();

  useEffect(() => {
    const currentPath = location.pathname;
    const pageTitle = routeTitles[currentPath] || "VideoralQ";
    document.title = pageTitle;
  }, [location]);

  return null;
}

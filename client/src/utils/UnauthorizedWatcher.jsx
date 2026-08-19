import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAllDetections } from "@/context/Sockets/AllDetectionContext";

const INCIDENT_ROUTE_MAP = {
  linecrossing: "/logs/line-crossing",
  unauthorizedaccess: "/logs/unauthorized-access",
  countpersons: "/logs/person-count",
  vehicleobstruction: "/logs/vehicle-obstruction",
  countvehicles: "/logs/vehicle-count",
  anpr: "/logs/ANPR",
  deskabsence: "/logs/desk-absence",
};

const normalizeIncidentType = (incidentType = "") =>
  String(incidentType).replace(/[^a-z0-9]/gi, "").toLowerCase();

export const getIncidentNavigationPath = (incidentType) =>
  INCIDENT_ROUTE_MAP[normalizeIncidentType(incidentType)] || "/dashboard";

const UnauthorizedWatcher = () => {
  const { allDetections } = useAllDetections();

  const shownDetections = useRef(new Set());
  const permissionAsked = useRef(false);

  useEffect(() => {
    if (!allDetections || allDetections.length === 0) return;

    allDetections.forEach((detection) => {
      const {
        nvrId,
        cameraId,
        channelName,
        incidentType = "Detection",
        severity = "low",
        timeOfIncident,
      } = detection;

      const key = `${nvrId}_${cameraId}_${incidentType}_${timeOfIncident}`;
      if (shownDetections.current.has(key)) return;
      shownDetections.current.add(key);

      // Ask notification permission ONLY once (on first detection)
      if (
        !permissionAsked.current &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        Notification.requestPermission();
        permissionAsked.current = true;
      }

      // Severity-based toast setup
      let toastFn = toast.info;
      let bgColor = "bg-blue-500";

      if (severity === "moderate") {
        toastFn = toast.warning;
        bgColor = "bg-yellow-500";
      } else if (severity === "high") {
        toastFn = toast.error;
        bgColor = "bg-red-500";
      }

      const cameraLabel = channelName ?? "Camera";
      const timeLabel = timeOfIncident
        ? new Date(timeOfIncident).toLocaleTimeString()
        : "Unknown time";

      const title = `🚨 ${incidentType}`;
      const description = `${cameraLabel} — ${timeLabel}`;

      // Show browser notification ONLY when tab is not visible
      if (
        document.visibilityState !== "visible" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const notification = new Notification(title, {
          body: description,
        });

        notification.onclick = () => {
          const targetPath = getIncidentNavigationPath(incidentType);
          window.focus();
          if (window.location.pathname !== targetPath) {
            window.location.assign(targetPath);
          }
        };
      } else {
        toastFn(title, {
          position: "bottom-left",
          description,
          className: `${bgColor} text-white font-semibold`,
          duration: 1000,
        });
      }
    });
  }, [allDetections]);

  return null;
};

export default UnauthorizedWatcher;

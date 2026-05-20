import React, { useEffect, useState } from 'react';
import UserContext from './Context';
import { getRecentIncidents } from '@/page/user/Dashboard/Api/get';
import { getSideBarConfig } from '@/layout/Api/get/index.jsx';
import { updateSidebarConfig } from '@/layout/Api/put/index.jsx';
import { toast } from 'sonner';

// Asset imports
import countPersons from '@/assets/countPersons.svg';
import countVehicles from '@/assets/countVehicles.svg';
import motionDetection from '@/assets/motionDetection.svg';
import genericObjectDetection from '@/assets/genericObjectDetection.svg';
import loiteringWithoutAuth from '@/assets/loiteringWithoutAuth.svg';
import loiteringWithAuth from '@/assets/loiteringWithAuth.svg';
import lineCrossing from '@/assets/lineCrossing.svg';
import unauthorizedAccess from '@/assets/unauthorizedAccess.svg';
import Geartool from '@/assets/Geartool.svg';

const ChartProvider = ({ children }) => {
  const [sidebarShow, setSidebarShow] = useState(false);
  const [streamModalShow, setStreamModalShow] = useState(false);
  const [switchOn, setSwitchOn] = useState([]);
  const [detectionStates, setDetectionStates] = useState({});
  const [detectionItems, setDetectionItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const Incident_url = import.meta.env.VITE_INCIDENT_URL;
  const formatDetectionLabel = (key) => {
    const map = {
      countPersons: 'Persons Count',
      countVehicles: 'Vehicles Count',
      motionDetection: 'Motion Detection',
      genericObjectDetection: 'Object Detection',
      loiteringWithoutAuth: 'Loitering Without Authentication',
      loiteringWithAuth: 'Loitering With Authentication',
      lineCrossing: 'Line Crossing',
      unauthorizedAccess: 'Intrusion Detection',
    };
    return map[key] || key;
  };

  const getIconForDetection = (key) => {
    const iconMap = {
      countPersons: countPersons,
      countVehicles: countVehicles,
      motionDetection: motionDetection,
      genericObjectDetection: genericObjectDetection,
      loiteringWithoutAuth: loiteringWithoutAuth,
      loiteringWithAuth: loiteringWithAuth,
      lineCrossing: lineCrossing,
      unauthorizedAccess: unauthorizedAccess,
    };
    return iconMap[key] || Geartool;
  };

  const fetchSidebarConfig = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const config = await getSideBarConfig();
      if (config.statusCode === 200) {
        const detections = config?.body?.data?.detectionConfigs || [];
        const items = detections.map(({ detectionType, displayName }) => ({
          id: detectionType,
          label: formatDetectionLabel(detectionType),
          src: getIconForDetection(detectionType),
        }));
        const states = detections.reduce((acc, cur) => {
          acc[cur.detectionType] = cur.isEnabled;
          return acc;
        }, {});

        setDetectionItems(items);
        setDetectionStates(states);
      } else {
        // toast.error(config.body.message || "Failed to fetch sidebar config.");
      }
    } catch (error) {
      console.error('Error fetching sidebar config:', error);
      // toast.error("Failed to fetch sidebar configuration. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSidebarConfig();
  }, [fetchSidebarConfig]);

  const handleDetectionToggle = async (id, enabled) => {
    // Save previous state for possible revert
    const prevDetectionStates = { ...detectionStates };
    const prevSwitchOn = switchOn;

    setDetectionStates((prev) => ({ ...prev, [id]: enabled }));
    setSwitchOn(enabled ? id : '');

    const detectionData = {
      detectionConfigs: [
        {
          detectionType: id,
          isEnabled: enabled
        }
      ]
    };

    try {
      const data = await updateSidebarConfig(detectionData);
      if (data.statusCode === 200) {
        const detections = data?.body?.data?.detectionConfigs || [];
        const items = detections.map(({ detectionType }) => ({
          id: detectionType,
          label: formatDetectionLabel(detectionType),
          src: getIconForDetection(detectionType),
        }));
        const states = detections.reduce((acc, cur) => {
          acc[cur.detectionType] = cur.isEnabled;
          return acc;
        }, {});
        GetIncidentsDashboard();
        setDetectionItems(items);
        setDetectionStates(states);
        toast.success(data.body.message);
      } else {
        // Revert optimistic update
        setDetectionStates(prevDetectionStates);
        setSwitchOn(prevSwitchOn);
        toast.error(data.body.message || "Failed to update detection settings");
      }
    } catch (error) {
      // Revert optimistic update
      setDetectionStates(prevDetectionStates);
      setSwitchOn(prevSwitchOn);
      console.error("API call failed:", error);
      toast.error("Failed to update detection settings. Please try again.");
    }
  };

  async function GetIncidentsDashboard() {
    const response = await getRecentIncidents();
    if (response.status === 200) {
      const incidents = Object.keys(response.data.body.data).map((incident) => {
        const incidentObject = response?.data?.body?.data[incident];
        const isEmpty = !incidentObject || Object.keys(incidentObject).length === 0;
        if (isEmpty) {
          return {
            incidentTypeKey: incident,
            label: incident,
            description: "No description available",
            state: false,
            metaData: [],
            personDetected: [],
            resolved: false,
          };
        }

        return {
          label: incidentObject?.displayName?? "Unknown Incident",
          state: true,
          videoLink: incidentObject?.videoLink,
          Image: incidentObject?.Image ? `${Incident_url}${incidentObject?.Image}` : null,
          alertThreshold: incidentObject?.alertThreshold,
          cameraId: incidentObject?.cameraId,
          channelId: incidentObject?.channelId,
          createdAt: incidentObject?.createdAt,
          description: incidentObject?.description ?? "No description available",
          incidentName: incidentObject?.displayName ?? "Unknown Incident",
          incidentType: incidentObject?.incidentType,
          nvrId: incidentObject?.nvrId,
          metaData: [
            incidentObject?.zone && { label: "Zone", value: incidentObject.zone },
            incidentObject?.cameraId && { label: "Camera Name", value: incidentObject?.channelData?.name },
            incidentObject?.severity && { label: "Severity", value: incidentObject.severity },
            incidentObject?.resolved !== undefined && { label: "Resolved", value: incidentObject.resolved ? "Yes" : "No" },
            incidentObject?.type && { label: "Type", value: incidentObject.type },
            Array.isArray(incidentObject?.personDetected) && incidentObject.personDetected.length > 0 && {
              label: "Person Detected",
              value: incidentObject.personDetected?.length ?? 0,
            },
          ].filter(Boolean),
          "zone": incidentObject?.zone,
          "severity": incidentObject?.severity,
          "resolved": incidentObject?.resolved ?? false,
          "type": incidentObject?.type,
          "personDetected": incidentObject?.personDetected ?? [],
        }
      });
      setSwitchOn(incidents)
      return response;
    }
  }
  useEffect(() => {
    GetIncidentsDashboard().catch(error => {
      console.error('Failed to fetch incidents on mount:', error);
    });
  }, [])
  return (
    <UserContext.Provider
      value={{
        sidebarShow,
        setSidebarShow,
        switchOn,
        setSwitchOn,
        streamModalShow,
        setStreamModalShow,
        GetIncidentsDashboard,
        detectionItems,
        detectionStates,
        handleDetectionToggle,
        isLoading
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export default ChartProvider;

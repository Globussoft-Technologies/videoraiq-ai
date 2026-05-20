// contexts/DetectionContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSocket } from './SocketContext';

const DetectionContext = createContext();

export const DetectionProvider = ({ children }) => {
  const [connectionParams, setConnectionParams] = useState({
    nvrId: null,
    cameraId: null
  });
  
  // Socket connection string
  const [connectionString, setConnectionString] = useState(null);
  const { socket, connect, disconnect } = useSocket(connectionString);
  
  // Detection states
  const [personCounts, setPersonCounts] = useState([]);
  const [motionDetections, setMotionDetections] = useState([]);
  const [objectDetections, setObjectDetections] = useState([]);
  const [allDetections, setAllDetections] = useState([]);
  const [lineCrossing, setLineCrossing] = useState([]);
  const [referencePoints, setReferencePoints] = useState({});
  const [zoneName, setZoneName] = useState("");
  const [unauthorizedAccess, setUnauthorizedAccess] = useState([]);
  // Update connection string when params change
  useEffect(() => {
    if (connectionParams?.nvrId && connectionParams?.cameraId) {
      const newConnectionString = `cameradetection_${connectionParams.nvrId}_${connectionParams.cameraId}`;
      setConnectionString(newConnectionString);
    }
  }, [connectionParams]);

  //  useEffect(() => {
  //   const data=personCounts?.detectionSetting?.settings?.referencePoints?.[connectionParams.cameraId]
  //    setReferencePoints(
  //     data?.points || {}
  //    );
  //    setZoneName(data?.zone_name|| "");
  //  }, [personCounts]);



  // Handle socket events when connection changes
  useEffect(() => {
    if (!socket || !connectionString) return;
    const handleDetection = (data) => {
      
      // Update combined detections
      setAllDetections(prev => [data, ...prev].slice(0, 100));
      // Update specific state based on incidentType
      switch(data.incidentType) {
        case 'countPersons':
          setPersonCounts(data);
          break;
        case 'motionDetection':
          setMotionDetections(data);
          break;
        case 'genericObjectDetection':
          setObjectDetections(data);
          break;
        case 'lineCrossing':
          setLineCrossing(data);
          break;
        case 'unauthorizedAccess':
          setUnauthorizedAccess(data);
        default:
          console.warn('Unknown incident type:', data.incidentType);
      }
    };

    socket.on(connectionString, handleDetection);

    return () => {
      socket.off(connectionString, handleDetection);
    };
  }, [socket, connectionString]);

  // Function to update connection parameters
  const updateConnection = (nvrId, cameraId) => {
    setConnectionParams({ nvrId: nvrId, cameraId: cameraId });
    const newConnectionString = `cameradetection_${nvrId}_${cameraId}`;
      setConnectionString(newConnectionString);
  };

  const reSetDetectionValue = () => {
    setPersonCounts([]);
    setMotionDetections([]);
    setObjectDetections([]);
    setAllDetections([]);
    setLineCrossing([]);
    setReferencePoints({});
    setZoneName("");
    setUnauthorizedAccess([]);
  }


  const value = {
    personCounts,
    motionDetections,
    objectDetections,
    allDetections,
    updateConnection,
    reSetDetectionValue,
    currentConnection: connectionParams,
    lineCrossing,
    // referencePoints,
    // zoneName,
    unauthorizedAccess
    // getLatestDetection: (type) => {
    //   switch(type) {
    //     case 'countPersons': return personCounts[0];
    //     case 'motionDetection': return motionDetections[0];
    //     case 'genericObjectDetection': return objectDetections[0];
    //     default: return allDetections[0];
    //   }
    // }
  };

  return (
    <DetectionContext.Provider value={value}>
      {children}
    </DetectionContext.Provider>
  );
};

export const useDetection = () => useContext(DetectionContext);
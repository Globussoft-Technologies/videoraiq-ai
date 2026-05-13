
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import getAccessToken from "@/utils/getAccessToken";
import { useAuth } from "../AuthContext"; const SocketContext = createContext();
export const useSocket = () => useContext(SocketContext);

// Extract backend origin only (not the /api-backend path)
// Use local backend for development, remote backend for production
const BACKEND_URL = import.meta.env.VITE_BACKEND 
const HOST = BACKEND_URL ? new URL(BACKEND_URL).origin : null;
const SOCKET_PATH = "/api-backend/socket.io";

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  const currentVideoRef = useRef(null);

  useEffect(() => {
    const token = getAccessToken();
    // If user logs out → disconnect
    if (!user || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }

    // Already connected → skip recreating socket
    if (socketRef.current) return;
    
    if (!HOST) {
      console.error("🚨 Socket HOST is not configured. Check VITE_BACKEND env variable.");
      return;
    }
    
 

    
    const socket = io(HOST, {
      path: SOCKET_PATH,
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      // Allow all transports - websocket, polling, etc
      // transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {

      
      setConnected(true);
      
      // Periodic status check
      const statusInterval = setInterval(() => {
       
      }, 30000); // Every 30 seconds
      
      return () => clearInterval(statusInterval);
    });

    socket.on("disconnect", (reason) => {
    
     
      setConnected(false);
    });
    
    socket.on("connect_error", (error) => {
      
    });
    
    socket.onAny((eventName, ...args) => {
  
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        currentVideoRef,
        changeCurrentVideoRef: (ref) => (currentVideoRef.current = ref),
        resetCurrentVideoRef: () => (currentVideoRef.current = null),
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

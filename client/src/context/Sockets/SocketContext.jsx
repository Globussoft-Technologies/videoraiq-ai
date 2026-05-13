import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import getAccessToken from "@/utils/getAccessToken";
import { useAuth } from "../AuthContext"; // assuming you already have useAuth

const SocketContext = createContext();
export const useSocket = () => useContext(SocketContext);

const HOST = import.meta.env.VITE_BACKEND;

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
    const socket = io(HOST, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", (reason) => {
      setConnected(false);
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

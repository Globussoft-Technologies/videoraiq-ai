import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { PermissionProvider } from '@/context/PermissionContext';
import { SocketProvider } from '@/context/SocketContext';
import { AttendanceSocketProvider } from '@/context/AttendanceSocketContext';
import { DetectionNotificationProvider } from '@/context/DetectionNotificationContext';
import { router } from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <PermissionProvider>
        <SocketProvider>
          <AttendanceSocketProvider>
            <DetectionNotificationProvider>
              <RouterProvider router={router} />
              <Toaster position="top-right" richColors closeButton />
            </DetectionNotificationProvider>
          </AttendanceSocketProvider>
        </SocketProvider>
      </PermissionProvider>
    </AuthProvider>
  </StrictMode>
);

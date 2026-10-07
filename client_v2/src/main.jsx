import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { PermissionProvider } from '@/context/PermissionContext';
import { LicenseProvider } from '@/context/LicenseContext';
import { SocketProvider } from '@/context/SocketContext';
import { LogsConfigProvider } from '@/context/LogsConfigContext';
import { ModuleConfigProvider } from '@/context/ModuleConfigContext';
import { AttendanceSocketProvider } from '@/context/AttendanceSocketContext';
import { DetectionNotificationProvider } from '@/context/DetectionNotificationContext';
import { TimezoneProvider } from '@/context/TimezoneContext';
import { router } from './App';
import './utils/setupAxiosSession';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <TimezoneProvider>
        <PermissionProvider>
        <ModuleConfigProvider>
        <SocketProvider>
          {/* LicenseProvider sits inside SocketProvider: the superadmin pushes
              detection-licence changes over `detectionLicense_<adminId>`, so it
              needs the socket to stay live without a reload. */}
          <LicenseProvider>
            <LogsConfigProvider>
              <AttendanceSocketProvider>
                <DetectionNotificationProvider>
                  <RouterProvider router={router} />
                  <Toaster position="top-right" richColors closeButton />
                </DetectionNotificationProvider>
              </AttendanceSocketProvider>
            </LogsConfigProvider>
          </LicenseProvider>
        </SocketProvider>
        </ModuleConfigProvider>
        </PermissionProvider>
      </TimezoneProvider>
    </AuthProvider>
  </StrictMode>
);

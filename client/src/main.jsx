import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'sonner';
import { SocketProvider } from './context/Sockets/SocketContext';
import { AllDetectionProvider } from './context/Sockets/AllDetectionContext';
import { PermissionProvider } from './context/Permission/PermissionContext';
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <PermissionProvider>
        <SocketProvider>
          <AllDetectionProvider>
              <App />
          </AllDetectionProvider>
          <Toaster richColors />
        </SocketProvider>
      </PermissionProvider>
    </AuthProvider>
  </StrictMode>
);

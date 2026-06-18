import { RouterProvider } from 'react-router-dom';
import { routes } from './routes/routes';
import './styles/global.css';
import { useSocket } from './context/Sockets/SocketContext';
import {useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import UnauthorizedWatcher from './utils/UnauthorizedWatcher';


function App() {
  useEffect(() => {
    // Read the env variable
    const isDevtoolsDetectEnabled =
      import.meta.env.VITE_ENABLE_DEVTOOLS_DETECT === "true";

    if (isDevtoolsDetectEnabled) {
      const interval = setInterval(() => {
        const start = performance.now();
        // eslint-disable-next-line no-debugger -- intentional DevTools-open detection
        debugger; // This pauses only when DevTools is open
        const end = performance.now();

        if (end - start > 100) {
          console.log("DevTools is OPEN");
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, []);
  const { socket } = useSocket();
  const {user} = useAuth();

  
  useEffect(() => {
    if (!socket || !user) return;
    const channel = `${user.user_email}/${user.user_id}`;
    socket.on(channel, (data) => {
      console.log('Received data:', data);
    });

    return () => {
      socket.off(channel);
    };
  }, [socket, user]);


  return (
    <>
        <UnauthorizedWatcher />
        <RouterProvider router={routes} />
    </>
  );
}

export default App;

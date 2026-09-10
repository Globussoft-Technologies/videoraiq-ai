import { Navigate, Route } from 'react-router-dom';
import { V2ThemeProvider } from '@/theme/ThemeContext';
import FloMattressDashboard from './FloMattressDashboard';
import FloMattressStation from './FloMattressStation';

const withFloTheme = (element) => (
  <V2ThemeProvider defaultTheme="light">
    {element}
  </V2ThemeProvider>
);

export const floMattressRoutes = (
  <>
    <Route path="/flo-mattress" element={<Navigate to="/start-measure" replace />} />
    <Route path="/flo-mattress/login" element={<Navigate to="/start-measure" replace />} />
    <Route path="/start-measure" element={withFloTheme(<FloMattressStation />)} />
    <Route path="/mattress/dashboard" element={withFloTheme(<FloMattressDashboard />)} />
  </>
);

import { Navigate, Route } from 'react-router-dom';
import { V2ThemeProvider } from '@/theme/ThemeContext';
import FloMattressLogin from './FloMattressLogin';
import FloMattressDashboard from './FloMattressDashboard';
import FloMattressStation from './FloMattressStation';

const withFloTheme = (element) => (
  <V2ThemeProvider defaultTheme="light">
    {element}
  </V2ThemeProvider>
);

export const floMattressRoutes = (
  <>
    <Route path="/flo-mattress" element={<Navigate to="/flo-mattress/login" replace />} />
    <Route path="/flo-mattress/login" element={withFloTheme(<FloMattressLogin />)} />
    <Route path="/start-measure" element={withFloTheme(<FloMattressStation />)} />
    <Route path="/mattress/dashboard" element={withFloTheme(<FloMattressDashboard />)} />
  </>
);

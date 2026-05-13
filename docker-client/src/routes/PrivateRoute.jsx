import Cookies from 'js-cookie';
import { Navigate, Outlet } from 'react-router-dom';

// Authentication Logic Using Cookies
const isAuthenticated = () => {
  // Getting value of cookie
  return Cookies.get('token');
};

const PrivateRoute = () => {
  return isAuthenticated() ? <Outlet /> : <Navigate to="/admin/login" />;
};

export default PrivateRoute;

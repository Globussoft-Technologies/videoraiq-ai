import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router-dom';
import { v2Routes } from './routes';
import LoginForm from '@/page/user/Users/UserForm';
import ForgotPassword from '@/page/user/Users/ForgotPassword';
import ResetPassword from '@/page/user/Users/ResetPassword';
import EmployeeLogin from '@/page/user/Portal/EmployeeLogin';
import EmployeeRegister from '@/page/user/Portal/EmployeeRegister';
import IsAuth from '@/components/Auth/IsAuth';
import Logout from '@/components/Auth/Logout';
import VerifyRecipient from '@/page/user/Administer/VerifyRecipient';

/**
 * Standalone V2 app router.
 * - /admin-login is the admin login (the app's auth gate) — unchanged.
 * - /employee-login and /employee-register are the public, light-themed
 *   employee/user portal pages (visually separate from the admin login).
 * - The V2 route subtree is mounted at the root and gated behind IsAuth.
 * - Root and unknown paths redirect to /, which bounces to /admin-login when
 *   there's no session.
 */
export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="/admin-login" element={<LoginForm />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/employee-login" element={<EmployeeLogin />} />
      <Route path="/employee-register" element={<EmployeeRegister />} />
      <Route path="/verify" element={<VerifyRecipient />} />
      <Route path="/logout" element={<Logout />} />
      <Route
        element={
          <IsAuth>
            <Outlet />
          </IsAuth>
        }
      >
        {v2Routes}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  )
);

export default router;

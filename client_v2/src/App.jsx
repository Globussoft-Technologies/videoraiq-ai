import { lazy, Suspense } from 'react';
import PageLoader from '@/components/PageLoader';
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router-dom';
import { v2Routes } from './routes';
import IsAuth from '@/components/Auth/IsAuth';
import Logout from '@/components/Auth/Logout';
import { floMattressRoutes } from '@/page/user/flo-mattress/FloMattressRoutes';
import MobileSso from '@/pages/MobileSso';

const LoginForm = lazy(() => import('@/page/user/Users/UserForm'));
const ForgotPassword = lazy(() => import('@/page/user/Users/ForgotPassword'));
const ResetPassword = lazy(() => import('@/page/user/Users/ResetPassword'));
const EmployeeLogin = lazy(() => import('@/page/user/Portal/EmployeeLogin'));
const EmployeeRegister = lazy(() => import('@/page/user/Portal/EmployeeRegister'));
const VerifyRecipient = lazy(() => import('@/page/user/Administer/VerifyRecipient'));

function LoginRoute() {
  return <LoginForm />;
}

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
    <Route element={<Suspense fallback={<PageLoader />}><Outlet /></Suspense>}>
      <Route path="/admin-login" element={<LoginRoute />} />
      <Route path="/mobile-sso" element={<MobileSso />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/employee-login" element={<EmployeeLogin />} />
      <Route path="/employee-register" element={<EmployeeRegister />} />
      <Route path="/verify" element={<VerifyRecipient />} />
      <Route path="/logout" element={<Logout />} />
      {floMattressRoutes}
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

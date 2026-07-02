import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router-dom';
import { v2Routes } from './routes';
import LoginForm from '@/page/user/Users/UserForm';
import IsAuth from '@/components/Auth/IsAuth';
import Logout from '@/components/Auth/Logout';

/**
 * Standalone V2 app router.
 * - /user-login is public (the new-design login, ported from the prototype).
 * - The V2 route subtree is mounted at the root and gated behind IsAuth.
 * - Root and unknown paths redirect to /, which bounces to /user-login when
 *   there's no session.
 */
export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="/user-login" element={<LoginForm />} />
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

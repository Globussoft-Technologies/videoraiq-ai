import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router-dom';
import { v2Routes } from './routes';
import LoginForm from '@/page/user/Users/UserForm';
import IsAuth from '@/components/Auth/IsAuth';
import Logout from '@/components/Auth/Logout';

/**
 * Standalone V2 app router.
 * - /user-login is public (the new-design login, ported from the prototype).
 * - The V2 route subtree stays mounted at /v2 (so relative NavLinks and the
 *   V2Layout path logic keep working) and is gated behind IsAuth.
 * - Root and unknown paths redirect to /v2, which bounces to /user-login when
 *   there's no session.
 */
export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="/user-login" element={<LoginForm />} />
      <Route path="/logout" element={<Logout />} />
      <Route index element={<Navigate to="/v2" replace />} />
      <Route
        element={
          <IsAuth>
            <Outlet />
          </IsAuth>
        }
      >
        {v2Routes}
      </Route>
      <Route path="*" element={<Navigate to="/v2" replace />} />
    </Route>
  )
);

export default router;

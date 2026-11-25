import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector, useCan } from '../app/hooks';
import { logout } from '../features/auth/authSlice';
import type { Action, Area } from '../types';
import { PageHeader } from './ui';
import ChangePasswordModal from './ChangePasswordModal';

/** Redirects to /login when there is no session or it has expired (the access token itself renews silently). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, sessionExpiresAt } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const expired = !!sessionExpiresAt && sessionExpiresAt <= Date.now();
  useEffect(() => {
    if (user && expired) dispatch(logout());
  }, [user, expired, dispatch]);
  if (!user || expired) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Temporary password: block every page (including URLs typed in the address bar) until it is changed.
  // The app itself is not rendered, so no page data is loaded behind the popup.
  if (user.mustChangePassword) return <ChangePasswordModal />;
  return <>{children}</>;
}

/** Shows an access-denied message when the role lacks permission for an area. */
export function RequireAccess({ area, action = 'view', children }: { area: Area; action?: Action; children: ReactNode }) {
  const can = useCan();
  if (!can(area, action)) {
    return (
      <>
        <PageHeader title="No access" subtitle={`Your role does not have permission to ${action} ${area.toLowerCase()}.`} />
        <div className="card p-6 text-sm text-slate-600">Ask an administrator if you need access to this page.</div>
      </>
    );
  }
  return <>{children}</>;
}

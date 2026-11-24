import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { initials } from '../utils/format';
import { useAppDispatch, useAppSelector, useCan } from '../app/hooks';
import { logout } from '../features/auth/authSlice';
import { fetchRoles } from '../features/roles/rolesSlice';
import { selectCurrentRole } from '../app/selectors';
import type { Area } from '../types';
import { Logo } from './Logo';
import { Spinner } from './ui';

const NAV: { to: string; label: string; area: Area | null; icon: string }[] = [
  { to: '/dashboard', label: 'Dashboard', area: null, icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { to: '/employees', label: 'Employees', area: 'Employees', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' },
  { to: '/departments', label: 'Departments', area: 'Departments', icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h6' },
  { to: '/customers', label: 'Customers', area: 'Customers', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8' },
  { to: '/products', label: 'Products', area: 'Products', icon: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8' },
  { to: '/orders', label: 'Orders', area: 'Orders', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0' },
  { to: '/reports', label: 'Reports', area: 'Reports', icon: 'M3 3v18h18M7 15l4-4 3 3 5-6' },
  { to: '/settings', label: 'Settings', area: 'Settings', icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
];

/**
 * After sign-in, loads the roles and the user's permissions (needed for the menu and access checks).
 * Everything else is fetched by each page from the API.
 */
function useBootstrapData() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.roles.status);
  useEffect(() => {
    if (status === 'idle') dispatch(fetchRoles());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);
  if (status === 'failed') return 'failed';
  return status === 'succeeded' ? 'ready' : 'loading';
}

export default function Layout() {
  const user = useAppSelector((s) => s.auth.user)!;
  const can = useCan();
  const role = useAppSelector(selectCurrentRole);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const data = useBootstrapData();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Hide the menu until roles have loaded so it does not flash with only Dashboard.
  const items = data === 'loading' ? [] : NAV.filter((n) => n.area === null || can(n.area));

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex flex-col justify-between gap-6 bg-slate-900 px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:py-6">
        <div className="flex flex-col gap-7">
          <div className="flex items-center justify-between px-2">
            <Logo size={36} />
            <button
              type="button"
              className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="sr-only">Toggle menu</span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d={menuOpen ? 'M6 6l12 12M18 6 6 18' : 'M3 6h18M3 12h18M3 18h18'} />
              </svg>
            </button>
          </div>
          <nav id="main-nav" aria-label="Main" className={`${menuOpen ? 'flex' : 'hidden'} flex-col gap-1 lg:flex`}>
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive ? 'bg-blue-800 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={n.icon} />
                </svg>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className={`${menuOpen ? 'flex' : 'hidden'} flex-col gap-2 border-t border-slate-800 pt-4 lg:flex`}>
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-[13px] font-semibold text-white">
              {initials(user.name)}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{user.name}</div>
              <div className="text-xs text-slate-300">{role?.name ?? 'No role'}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-8">
        {data === 'ready' ? (
          <Outlet />
        ) : data === 'failed' ? (
          <div className="card p-6 text-sm text-red-700">Could not load data. Refresh the page to try again.</div>
        ) : (
          <Spinner label="Loading workspace…" />
        )}
      </main>
    </div>
  );
}

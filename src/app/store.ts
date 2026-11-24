import { configureStore } from '@reduxjs/toolkit';
import auth, { sessionChanged } from '../features/auth/authSlice';
import { sessionStore } from '../services/session';
import roles from '../features/roles/rolesSlice';
import settings from '../features/settings/settingsSlice';

// Business data (employees, orders, …) is fetched by each page from the API; Redux only holds
// app-wide state: the session, roles/permissions and local settings.
export const store = configureStore({
  reducer: { auth, roles, settings },
});

// Keep Redux in step with token refreshes and with sign-outs triggered by a failed refresh.
sessionStore.subscribe((session) => store.dispatch(sessionChanged(session)));

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

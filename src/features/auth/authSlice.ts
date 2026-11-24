import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authService } from '../../services/authService';
import { sessionStore, type Session } from '../../services/session';
import type { AuthUser } from '../../types';
import type { AppDispatch } from '../../app/store';

interface AuthState {
  user: AuthUser | null;
  /** When the whole session ends (refresh token expiry). The access token renews silently before then. */
  sessionExpiresAt: number | null;
  status: 'idle' | 'loading' | 'failed';
  error: string | null;
}

const fromSession = (s: Session | null) => ({ user: s?.user ?? null, sessionExpiresAt: s?.refreshExpiresAt ?? null });

export const login = createAsyncThunk<
  Session,
  { email: string; password: string },
  { rejectValue: string }
>('auth/login', async ({ email, password }, { rejectWithValue }) => {
  try {
    const session = await authService.login(email, password);
    sessionStore.start(session);
    return session;
  } catch (err) {
    return rejectWithValue((err as Error).message);
  }
});

const initialState: AuthState = { ...fromSession(sessionStore.get()), status: 'idle', error: null };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Mirrors the session store: token refresh, sign-out, or a failed refresh. */
    sessionChanged(state, { payload }: PayloadAction<Session | null>) {
      Object.assign(state, fromSession(payload));
      if (!payload) state.status = 'idle';
    },
  },
  extraReducers: (b) => {
    b.addCase(login.pending, (s) => {
      s.status = 'loading';
      s.error = null;
    })
      .addCase(login.fulfilled, (s, { payload }) => {
        s.status = 'idle';
        Object.assign(s, fromSession(payload));
      })
      .addCase(login.rejected, (s, { payload }) => {
        s.status = 'failed';
        s.error = payload ?? 'Sign in failed.';
      });
  },
});

export const { sessionChanged } = authSlice.actions;

// TODO: call the backend logout endpoint here when one exists, to revoke the refresh token.
export const logout = () => (_dispatch: AppDispatch) => {
  sessionStore.clear(); // the store subscription dispatches sessionChanged(null)
};

export default authSlice.reducer;

import type { AuthUser } from '../types';
import { api, getErrorMessage, publicApi, setRefreshHandler, unwrap, type ApiResponse } from './apiClient';
import { sessionStore, type Session, type Tokens } from './session';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number; // seconds
  refresh_expires_in?: number; // seconds
  is_temporary_password?: boolean;
}

interface ProfileResponse {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role_id: number | null;
  role: { id: number; name: string } | null;
  is_temporary_password: boolean;
}

function toTokens(t: TokenResponse, previous?: Tokens): Tokens {
  const now = Date.now();
  return {
    accessToken: t.access_token,
    // If the refresh call doesn't rotate the refresh token, keep using the old one.
    refreshToken: t.refresh_token ?? previous?.refreshToken ?? '',
    accessExpiresAt: now + t.expires_in * 1000,
    refreshExpiresAt: t.refresh_expires_in ? now + t.refresh_expires_in * 1000 : (previous?.refreshExpiresAt ?? 0),
  };
}

function toAuthUser(p: ProfileResponse): AuthUser {
  return {
    id: String(p.id),
    name: `${p.first_name} ${p.last_name}`.trim() || p.email,
    email: p.email,
    roleId: p.role_id == null ? '' : String(p.role_id),
    mustChangePassword: !!p.is_temporary_password,
  };
}

export const authService = {
  async login(email: string, password: string): Promise<Session> {
    const username = email.trim();
    try {
      const { data } = await publicApi.post<ApiResponse<TokenResponse>>(
        '/auth/login',
        new URLSearchParams({ username, password }), // sent as application/x-www-form-urlencoded
      );
      const token = unwrap(data, 'Sign in failed.');
      const tokens = toTokens(token);
      // The session isn't stored yet, so pass the new token explicitly.
      const profile = await publicApi.get<ApiResponse<ProfileResponse>>('/employees/profile', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const user = toAuthUser(unwrap(profile.data, 'Could not load your profile.'));
      // Either the login response or the profile can report a temporary password.
      user.mustChangePassword = user.mustChangePassword || !!token.is_temporary_password;
      return { ...tokens, user };
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Email or password is incorrect.'));
    }
  },

  async refresh(refreshToken: string, previous?: Tokens): Promise<Tokens> {
    const { data } = await publicApi.post<ApiResponse<TokenResponse>>('/auth/refresh', { refresh_token: refreshToken });
    return toTokens(unwrap(data, 'Session expired.'), previous);
  },

  /** Replaces the signed-in user's own password. The backend clears is_temporary_password. */
  async changePassword(newPassword: string, confirmPassword: string): Promise<void> {
    try {
      const { data } = await api.patch<ApiResponse<unknown>>('/employees/change-password', {
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      unwrap(data, 'Could not change your password.');
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not change your password.'));
    }
  },
};

// Lets the axios client renew tokens without importing this module (avoids a circular import).
setRefreshHandler((refreshToken) => authService.refresh(refreshToken, sessionStore.get() ?? undefined));

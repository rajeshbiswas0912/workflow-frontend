import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { sessionStore, type Tokens } from './session';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    /** Set on a request that is being replayed after a token refresh, so it is retried only once. */
    _retried?: boolean;
  }
}

const baseURL = import.meta.env.VITE_API_BASE_URL;

/** For endpoints that don't need a token (login, refresh). Has no interceptors, so it can't loop. */
export const publicApi = axios.create({ baseURL, timeout: 15_000 });

/** For every authenticated endpoint. Adds the bearer token and refreshes it silently when needed. */
export const api = axios.create({ baseURL, timeout: 15_000 });

/** Renew the access token this long before it expires, so requests never go out with a stale one. */
const REFRESH_LEEWAY_MS = 30_000;

// Wired up by authService to avoid a circular import (authService uses publicApi from here).
let refreshHandler: ((refreshToken: string) => Promise<Tokens>) | null = null;
export function setRefreshHandler(handler: typeof refreshHandler): void {
  refreshHandler = handler;
}

/**
 * One refresh at a time: if several requests find the token expired together,
 * they all wait on the same refresh call instead of each starting their own.
 */
let inflightRefresh: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  inflightRefresh ??= (async () => {
    const session = sessionStore.get();
    if (!session || session.refreshExpiresAt <= Date.now() || !refreshHandler) {
      throw new Error('Session expired');
    }
    const tokens = await refreshHandler(session.refreshToken);
    sessionStore.updateTokens(tokens);
    return tokens.accessToken;
  })()
    .catch((err) => {
      // Refresh failed (refresh token expired or revoked): end the session. The auth slice
      // follows the session store, so the app redirects to /login.
      sessionStore.clear();
      throw err;
    })
    .finally(() => {
      inflightRefresh = null;
    });
  return inflightRefresh;
}

api.interceptors.request.use(async (config) => {
  const session = sessionStore.get();
  if (!session) return config;
  const token =
    session.accessExpiresAt - REFRESH_LEEWAY_MS <= Date.now() ? await refreshAccessToken() : session.accessToken;
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig | undefined;
    // A 401 can still happen if the server revoked or expired the token early: refresh once and replay.
    if (error.response?.status !== 401 || !config || config._retried || !sessionStore.get()) {
      throw error;
    }
    config._retried = true;
    const token = await refreshAccessToken();
    config.headers.Authorization = `Bearer ${token}`;
    return api(config);
  },
);

/** Envelope every backend response is wrapped in. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/** Returns the payload of a backend response, or throws its message when `success` is false. */
export function unwrap<T>(body: ApiResponse<T>, fallback: string): T {
  if (!body.success) throw new Error(body.message || fallback);
  return body.data;
}

/** Turns an axios/network error into a message fit to show the user. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return err.code === 'ECONNABORTED' ? 'The server took too long to respond.' : 'Cannot reach the server. Check your connection.';
    }
    const data = err.response.data as { message?: unknown; detail?: unknown } | undefined;
    if (typeof data?.message === 'string' && data.message) return data.message;
    if (typeof data?.detail === 'string' && data.detail) return data.detail;
    if (Array.isArray(data?.detail) && typeof data.detail[0]?.msg === 'string') return data.detail[0].msg;
    return fallback;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

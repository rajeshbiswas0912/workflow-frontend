import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
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

/**
 * The API rejects (503) more than a few simultaneous requests, and pages like the dashboard load many
 * widgets at once. So at most MAX_CONCURRENT requests are on the wire; the rest wait their turn.
 * Kept below the server's limit to leave room for the token refresh (publicApi) and other tabs.
 */
const MAX_CONCURRENT = Number(import.meta.env.VITE_API_MAX_CONCURRENT) || 4;
/** A GET answered with one of these is retried after a short wait, as the server is only busy. */
const RETRY_STATUSES = new Set([429, 503]);
const RETRY_DELAYS_MS = [400, 1200];

let active = 0;
const waiting: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  // The slot is handed over directly by releaseSlot, so `active` stays the same.
  return new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps axios's own adapter (the part that does the actual HTTP call) with the queue and retry.
 * Interceptors run outside it, so a request waiting on a token refresh doesn't hold a slot.
 */
function limitedAdapter(inner: AxiosAdapter): AxiosAdapter {
  return async (config) => {
    const canRetry = (config.method ?? 'get').toLowerCase() === 'get';
    for (let attempt = 0; ; attempt++) {
      await acquireSlot();
      try {
        return await inner(config);
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (!canRetry || status === undefined || !RETRY_STATUSES.has(status) || attempt >= RETRY_DELAYS_MS.length) {
          throw err;
        }
      } finally {
        releaseSlot();
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  };
}

/** For every authenticated endpoint. Adds the bearer token and refreshes it silently when needed. */
export const api = axios.create({
  baseURL,
  timeout: 15_000,
  adapter: limitedAdapter(axios.getAdapter(axios.defaults.adapter)),
});

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

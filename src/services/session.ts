import type { AuthUser } from '../types';

/** Tokens issued by the backend, with absolute expiry times (ms since epoch). */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export interface Session extends Tokens {
  user: AuthUser;
}

type Listener = (session: Session | null) => void;

const STORAGE_KEY = 'workflow.auth';

/**
 * Single source of truth for the signed-in session. The axios client reads tokens from
 * here, and the Redux auth slice mirrors it through `subscribe`.
 * Persisted in localStorage, so it survives closing the browser until the refresh token expires.
 */
let current: Session | null = null;
const listeners = new Set<Listener>();

function read(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Session;
    // The session is usable as long as the refresh token is; the access token can be renewed.
    if (saved.refreshToken && saved.refreshExpiresAt > Date.now()) {
      current = saved;
    } else {
      write(null);
    }
  } catch {
    /* corrupt or unavailable storage: start signed out */
  }
}

function write(session: Session | null): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY); // left over from the old "keep me signed in" option
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the session lives in memory only */
  }
}

function emit(): void {
  listeners.forEach((l) => l(current));
}

read();

export const sessionStore = {
  get: (): Session | null => current,

  /** Starts a new session after login. */
  start(session: Session): void {
    current = session;
    write(current);
    emit();
  },

  /** Replaces tokens after a silent refresh, keeping the user. */
  updateTokens(tokens: Tokens): void {
    if (!current) return;
    current = { ...current, ...tokens };
    write(current);
    emit();
  },

  clear(): void {
    if (!current) return;
    current = null;
    write(null);
    emit();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

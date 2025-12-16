/**
 * Session domain types
 * Following SRP: session state is separate from auth operations
 */

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
}

export interface Session {
  user: SessionUser;
  activeHiveId?: string;
  roles?: string[];
}

export interface SessionState {
  status: SessionStatus;
  session: Session | null;
  error: Error | null;
}

/**
 * Session client interface (DIP: depend on abstraction)
 */
export interface ISessionClient {
  /**
   * Fetch current session from server
   * Returns null if unauthenticated
   */
  getSession(): Promise<Session | null>;

  /**
   * Refresh session (call after login/logout)
   */
  refreshSession(): Promise<Session | null>;
}

/**
 * Session observer for cross-component updates
 */
export type SessionObserver = (state: SessionState) => void;

/**
 * Session store interface
 */
export interface ISessionStore {
  getState(): SessionState;
  subscribe(observer: SessionObserver): () => void;
  refresh(): Promise<void>;
  setAuthenticated(session: Session): void;
  setUnauthenticated(): void;
  setError(error: Error): void;
}

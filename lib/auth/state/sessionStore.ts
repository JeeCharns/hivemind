import type {
  ISessionStore,
  ISessionClient,
  SessionState,
  SessionObserver,
  Session,
} from "../domain/session.types";

/**
 * Session store implementation
 * Single source of truth for session state
 * Uses observer pattern for reactive updates
 */
export class SessionStore implements ISessionStore {
  private state: SessionState = {
    status: "loading",
    session: null,
    error: null,
  };

  private observers = new Set<SessionObserver>();
  private client: ISessionClient;
  private refreshPromise: Promise<void> | null = null;

  constructor(client: ISessionClient) {
    this.client = client;
  }

  getState(): SessionState {
    return this.state;
  }

  subscribe(observer: SessionObserver): () => void {
    this.observers.add(observer);
    // Immediately notify new observer of current state
    observer(this.state);

    // Return unsubscribe function
    return () => {
      this.observers.delete(observer);
    };
  }

  async refresh(): Promise<void> {
    // Deduplicate in-flight requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    this.setState({
      status: "loading",
      session: this.state.session, // Keep existing session during refresh
      error: null,
    });

    try {
      const session = await this.client.getSession();

      if (session) {
        this.setAuthenticated(session);
      } else {
        this.setUnauthenticated();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      this.setError(err);
    }
  }

  setAuthenticated(session: Session): void {
    this.setState({
      status: "authenticated",
      session,
      error: null,
    });
  }

  setUnauthenticated(): void {
    this.setState({
      status: "unauthenticated",
      session: null,
      error: null,
    });
  }

  setError(error: Error): void {
    this.setState({
      status: "unauthenticated",
      session: null,
      error,
    });
  }

  private setState(newState: SessionState): void {
    this.state = newState;
    this.notifyObservers();
  }

  private notifyObservers(): void {
    this.observers.forEach((observer) => {
      observer(this.state);
    });
  }
}

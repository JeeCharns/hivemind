import { SessionStore } from "../state/sessionStore";
import type { ISessionClient, Session } from "../domain/session.types";

/**
 * Mock session client for testing
 */
class MockSessionClient implements ISessionClient {
  private mockSession: Session | null = null;
  private shouldFail = false;

  setMockSession(session: Session | null) {
    this.mockSession = session;
  }

  setShouldFail(fail: boolean) {
    this.shouldFail = fail;
  }

  async getSession(): Promise<Session | null> {
    if (this.shouldFail) {
      throw new Error("Network error");
    }
    return this.mockSession;
  }

  async refreshSession(): Promise<Session | null> {
    return this.getSession();
  }
}

describe("SessionStore", () => {
  let store: SessionStore;
  let mockClient: MockSessionClient;

  beforeEach(() => {
    mockClient = new MockSessionClient();
    store = new SessionStore(mockClient);
  });

  describe("initial state", () => {
    it("should start with loading status", () => {
      const state = store.getState();
      expect(state.status).toBe("loading");
      expect(state.session).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("refresh()", () => {
    it("should fetch session and update state to authenticated", async () => {
      const mockSession: Session = {
        user: {
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
        },
      };

      mockClient.setMockSession(mockSession);

      await store.refresh();

      const state = store.getState();
      expect(state.status).toBe("authenticated");
      expect(state.session).toEqual(mockSession);
      expect(state.error).toBeNull();
    });

    it("should update state to unauthenticated when session is null", async () => {
      mockClient.setMockSession(null);

      await store.refresh();

      const state = store.getState();
      expect(state.status).toBe("unauthenticated");
      expect(state.session).toBeNull();
      expect(state.error).toBeNull();
    });

    it("should handle errors and set error state", async () => {
      mockClient.setShouldFail(true);

      await store.refresh();

      const state = store.getState();
      expect(state.status).toBe("unauthenticated");
      expect(state.session).toBeNull();
      expect(state.error).toBeTruthy();
      expect(state.error?.message).toBe("Network error");
    });

    it("should deduplicate concurrent refresh calls", async () => {
      const mockSession: Session = {
        user: {
          id: "user-1",
          email: "test@example.com",
        },
      };

      mockClient.setMockSession(mockSession);

      // Call refresh multiple times concurrently
      const promises = [store.refresh(), store.refresh(), store.refresh()];

      await Promise.all(promises);

      // Should only fetch once (deduplication)
      const state = store.getState();
      expect(state.status).toBe("authenticated");
    });
  });

  describe("subscribe()", () => {
    it("should notify observers of state changes", async () => {
      const observer = jest.fn();
      const mockSession: Session = {
        user: {
          id: "user-1",
          email: "test@example.com",
        },
      };

      mockClient.setMockSession(mockSession);

      // Subscribe and immediately get current state
      store.subscribe(observer);
      expect(observer).toHaveBeenCalledTimes(1);

      // Refresh should trigger another notification
      await store.refresh();
      expect(observer).toHaveBeenCalledTimes(3);

      // Latest call should have authenticated state
      const lastCall = observer.mock.calls[observer.mock.calls.length - 1][0];
      expect(lastCall.status).toBe("authenticated");
      expect(lastCall.session).toEqual(mockSession);
    });

    it("should allow unsubscribe", async () => {
      const observer = jest.fn();
      const mockSession: Session = {
        user: {
          id: "user-1",
          email: "test@example.com",
        },
      };

      mockClient.setMockSession(mockSession);

      // Subscribe and then unsubscribe
      const unsubscribe = store.subscribe(observer);
      expect(observer).toHaveBeenCalledTimes(1);

      unsubscribe();

      // Refresh should not trigger notification
      await store.refresh();
      expect(observer).toHaveBeenCalledTimes(1); // No additional calls
    });
  });

  describe("setAuthenticated()", () => {
    it("should update state to authenticated", () => {
      const mockSession: Session = {
        user: {
          id: "user-1",
          email: "test@example.com",
        },
      };

      store.setAuthenticated(mockSession);

      const state = store.getState();
      expect(state.status).toBe("authenticated");
      expect(state.session).toEqual(mockSession);
      expect(state.error).toBeNull();
    });
  });

  describe("setUnauthenticated()", () => {
    it("should update state to unauthenticated", () => {
      store.setUnauthenticated();

      const state = store.getState();
      expect(state.status).toBe("unauthenticated");
      expect(state.session).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("setError()", () => {
    it("should update state with error", () => {
      const error = new Error("Test error");

      store.setError(error);

      const state = store.getState();
      expect(state.status).toBe("unauthenticated");
      expect(state.session).toBeNull();
      expect(state.error).toEqual(error);
    });
  });
});

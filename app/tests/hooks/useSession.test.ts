import { renderHook, waitFor, act } from "@testing-library/react";
import { useSession } from "../../(auth)/hooks/useSession";

const getSessionMock = jest.fn();
const onAuthStateChangeMock = jest.fn();
const signOutMock = jest.fn();
const unsubscribeMock = jest.fn();
let authCallback: ((event: unknown, session: unknown) => void) | null = null;

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChangeMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  },
}));

describe("useSession (auth route hook)", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    signOutMock.mockReset();
    unsubscribeMock.mockReset();
    authCallback = null;
  });

  it("hydrates session from supabase and finishes loading", async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    onAuthStateChangeMock.mockReturnValueOnce({
      data: { subscription: { unsubscribe: unsubscribeMock } },
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("updates session when auth state changes", async () => {
    const session = { user: { id: "u1" } };

    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    onAuthStateChangeMock.mockImplementationOnce((callback) => {
      authCallback = callback;
      return {
        data: {
          subscription: { unsubscribe: unsubscribeMock },
        },
      };
    });

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      authCallback?.("SIGNED_IN", session);
    });

    expect(result.current.session).toEqual(session);
    expect(result.current.user).toEqual(session.user);
  });

  it("signOut clears local state", async () => {
    const session = { user: { id: "u1" } };

    getSessionMock.mockResolvedValueOnce({ data: { session } });
    onAuthStateChangeMock.mockReturnValueOnce({
      data: { subscription: { unsubscribe: unsubscribeMock } },
    });
    signOutMock.mockResolvedValueOnce({});

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.user).toEqual(session.user));

    await act(async () => {
      await result.current.signOut();
    });

    expect(signOutMock).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });
});

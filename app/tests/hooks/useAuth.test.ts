import { act, renderHook } from "@testing-library/react";
import { useAuth } from "../../(auth)/hooks/useAuth";

const pushMock = jest.fn();
const refreshMock = jest.fn();
const notifyMock = jest.fn();
const signInWithOtpMock = jest.fn();
const signInWithPasswordMock = jest.fn();
const signOutMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/lib/auth/react/useSession", () => ({
  useSession: () => ({ refresh: refreshMock }),
}));

jest.mock("@/lib/auth/react/AuthProvider", () => ({
  notifySessionChange: () => notifyMock(),
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  },
}));

describe("useAuth", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    notifyMock.mockReset();
    signInWithOtpMock.mockReset();
    signInWithPasswordMock.mockReset();
    signOutMock.mockReset();
  });

  it("sends a magic link when password is empty", async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login("user@example.com", "");
    });

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "user@example.com",
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("signs in with password and redirects", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login("user@example.com", "secret");
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret",
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/hives");
  });

  it("throws when supabase returns an error", async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: new Error("fail") });
    const { result } = renderHook(() => useAuth());

    await expect(
      act(async () => {
        await result.current.login("user@example.com", "");
      })
    ).rejects.toThrow("fail");
  });

  it("signs out and redirects to login", async () => {
    signOutMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(signOutMock).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/login");
  });
});

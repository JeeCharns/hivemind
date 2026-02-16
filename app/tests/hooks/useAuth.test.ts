import { act, renderHook } from "@testing-library/react";
import { useAuth } from "../../(auth)/hooks/useAuth";

const pushMock = jest.fn();
const refreshMock = jest.fn();
const notifyMock = jest.fn();
const signInWithOtpMock = jest.fn();
const signInWithPasswordMock = jest.fn();
const signOutMock = jest.fn();
const verifyOtpMock = jest.fn();

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
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
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
    verifyOtpMock.mockReset();
  });

  describe("sendOtp", () => {
    it("sends OTP without emailRedirectTo", async () => {
      signInWithOtpMock.mockResolvedValueOnce({ error: null });
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.sendOtp("user@example.com");
      });

      expect(signInWithOtpMock).toHaveBeenCalledWith({
        email: "user@example.com",
        options: { shouldCreateUser: true },
      });
    });

    it("throws when supabase returns an error", async () => {
      signInWithOtpMock.mockResolvedValueOnce({ error: new Error("fail") });
      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.sendOtp("user@example.com");
        })
      ).rejects.toThrow("fail");
    });
  });

  describe("verifyOtp", () => {
    it("verifies OTP and refreshes session", async () => {
      verifyOtpMock.mockResolvedValueOnce({ error: null });
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.verifyOtp("user@example.com", "123456");
      });

      expect(verifyOtpMock).toHaveBeenCalledWith({
        email: "user@example.com",
        token: "123456",
        type: "email",
      });
      expect(refreshMock).toHaveBeenCalled();
      expect(notifyMock).toHaveBeenCalled();
    });

    it("throws when verification fails", async () => {
      verifyOtpMock.mockResolvedValueOnce({ error: new Error("Invalid code") });
      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.verifyOtp("user@example.com", "000000");
        })
      ).rejects.toThrow("Invalid code");
    });
  });

  describe("login", () => {
    it("calls sendOtp when password is empty", async () => {
      signInWithOtpMock.mockResolvedValueOnce({ error: null });
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login("user@example.com", "");
      });

      expect(signInWithOtpMock).toHaveBeenCalledWith({
        email: "user@example.com",
        options: { shouldCreateUser: true },
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
  });

  describe("logout", () => {
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
});

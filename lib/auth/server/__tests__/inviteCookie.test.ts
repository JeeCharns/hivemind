import {
  setInviteCookie,
  getInviteCookie,
  clearInviteCookie,
} from "../inviteCookie";

// Mock the cookies function from next/headers
const mockCookieStore = {
  set: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
}));

describe("inviteCookie", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("setInviteCookie", () => {
    it("should set cookie with correct options", async () => {
      const token = "test-invite-token-abc123";

      await setInviteCookie(token);

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        "hivemind_invite_token",
        token,
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          maxAge: 3600,
          path: "/",
        })
      );
    });
  });

  describe("getInviteCookie", () => {
    it("should return token when cookie exists", async () => {
      const token = "test-invite-token-abc123";
      mockCookieStore.get.mockReturnValue({ value: token });

      const result = await getInviteCookie();

      expect(mockCookieStore.get).toHaveBeenCalledWith("hivemind_invite_token");
      expect(result).toBe(token);
    });

    it("should return null when cookie does not exist", async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const result = await getInviteCookie();

      expect(result).toBeNull();
    });
  });

  describe("clearInviteCookie", () => {
    it("should delete the cookie", async () => {
      await clearInviteCookie();

      expect(mockCookieStore.delete).toHaveBeenCalledWith(
        "hivemind_invite_token"
      );
    });
  });
});

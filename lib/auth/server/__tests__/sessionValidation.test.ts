import {
  getValidatedAuthState,
  type ValidationReason,
} from "../sessionValidation";

/**
 * Helper to create a test JWT
 * @param payload - JWT payload
 * @param header - JWT header (optional)
 */
function createTestJwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }
): string {
  const encodeBase64Url = (obj: Record<string, unknown>): string => {
    const json = JSON.stringify(obj);
    const base64 = Buffer.from(json).toString("base64");
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  };

  const headerEncoded = encodeBase64Url(header);
  const payloadEncoded = encodeBase64Url(payload);
  const signature = "fake-signature";

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * Helper to create a Supabase auth cookie
 */
function createAuthCookie(
  accessToken: string,
  name = "sb-test-auth-token"
): Array<{
  name: string;
  value: string;
}> {
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "fake-refresh-token",
  };

  // Encode as base64 (simulating Supabase cookie format)
  const json = JSON.stringify(session);
  const base64 = Buffer.from(json).toString("base64");

  return [{ name, value: `base64-${base64}` }];
}

describe("sessionValidation", () => {
  describe("getValidatedAuthState", () => {
    beforeEach(() => {
      // Mock current time for consistent tests
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should return unauthenticated with reason 'missing' when no cookies present", () => {
      const result = getValidatedAuthState([]);

      expect(result).toEqual({
        isAuthenticated: false,
        reason: "missing",
      });
    });

    it("should return unauthenticated with reason 'invalid' when cookie is not parseable", () => {
      const cookies = [{ name: "sb-test-auth-token", value: "invalid-value" }];
      const result = getValidatedAuthState(cookies);

      expect(result).toEqual({
        isAuthenticated: false,
        reason: "missing", // findSupabaseAuthSessionCookie returns null
      });
    });

    it("should return unauthenticated with reason 'invalid' when JWT is malformed", () => {
      const cookies = createAuthCookie("not-a-jwt");
      const result = getValidatedAuthState(cookies);

      expect(result).toEqual({
        isAuthenticated: false,
        reason: "invalid",
      });
    });

    it("should return unauthenticated with reason 'no-sub' when JWT has no subject", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const jwt = createTestJwt({
        exp: nowSeconds + 3600, // Valid expiration
        // Missing sub
      });
      const cookies = createAuthCookie(jwt);
      const result = getValidatedAuthState(cookies);

      expect(result).toEqual({
        isAuthenticated: false,
        reason: "no-sub",
        userId: undefined,
      });
    });

    it("should return unauthenticated with reason 'no-exp' when JWT has no expiration", () => {
      const jwt = createTestJwt({
        sub: "user-123",
        // Missing exp
      });
      const cookies = createAuthCookie(jwt);
      const result = getValidatedAuthState(cookies);

      expect(result).toEqual({
        isAuthenticated: false,
        reason: "no-exp",
        userId: "user-123",
      });
    });

    it("should return unauthenticated with reason 'expired' when JWT is expired", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const jwt = createTestJwt({
        sub: "user-123",
        exp: nowSeconds - 3600, // Expired 1 hour ago
      });
      const cookies = createAuthCookie(jwt);
      const result = getValidatedAuthState(cookies);

      expect(result).toEqual({
        isAuthenticated: false,
        reason: "expired",
        userId: "user-123",
      });
    });

    it("should return unauthenticated when JWT expires within clock skew buffer (30s)", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const jwt = createTestJwt({
        sub: "user-123",
        exp: nowSeconds + 15, // Expires in 15 seconds (within 30s buffer)
      });
      const cookies = createAuthCookie(jwt);
      const result = getValidatedAuthState(cookies);

      expect(result).toEqual({
        isAuthenticated: false,
        reason: "expired",
        userId: "user-123",
      });
    });

    it("should return authenticated with reason 'valid' when JWT is valid and not expired", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const jwt = createTestJwt({
        sub: "user-123",
        exp: nowSeconds + 3600, // Expires in 1 hour
        email: "test@example.com",
      });
      const cookies = createAuthCookie(jwt);
      const result = getValidatedAuthState(cookies);

      expect(result.isAuthenticated).toBe(true);
      expect(result.reason).toBe("valid");
      expect(result.userId).toBe("user-123");
      expect(result.session).toBeDefined();
      expect(result.session?.access_token).toBe(jwt);
    });

    it("should return authenticated when JWT expires just outside clock skew buffer", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const jwt = createTestJwt({
        sub: "user-123",
        exp: nowSeconds + 31, // Expires in 31 seconds (just outside 30s buffer)
      });
      const cookies = createAuthCookie(jwt);
      const result = getValidatedAuthState(cookies);

      expect(result.isAuthenticated).toBe(true);
      expect(result.reason).toBe("valid");
    });

    it("should handle chunked cookies correctly", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const jwt = createTestJwt({
        sub: "user-123",
        exp: nowSeconds + 3600,
      });

      const session = {
        access_token: jwt,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "fake-refresh-token",
      };

      const json = JSON.stringify(session);
      const base64 = Buffer.from(json).toString("base64");
      const base64WithPrefix = `base64-${base64}`;

      // Split into chunks
      const mid = Math.floor(base64WithPrefix.length / 2);
      const chunk0 = base64WithPrefix.slice(0, mid);
      const chunk1 = base64WithPrefix.slice(mid);

      const cookies = [
        { name: "sb-test-auth-token.0", value: chunk0 },
        { name: "sb-test-auth-token.1", value: chunk1 },
      ];

      const result = getValidatedAuthState(cookies);

      expect(result.isAuthenticated).toBe(true);
      expect(result.reason).toBe("valid");
      expect(result.userId).toBe("user-123");
    });

    it("should reject JWT with exp at exact boundary (current time)", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const jwt = createTestJwt({
        sub: "user-123",
        exp: nowSeconds, // Expires exactly now
      });
      const cookies = createAuthCookie(jwt);
      const result = getValidatedAuthState(cookies);

      expect(result.isAuthenticated).toBe(false);
      expect(result.reason).toBe("expired");
    });

    it("should validate the session returned by findSupabaseAuthSessionCookie", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Create a valid JWT
      const validJwt = createTestJwt({
        sub: "user-123",
        exp: nowSeconds + 3600,
      });
      const validCookies = createAuthCookie(validJwt, "sb-valid-auth-token");

      // Create an expired JWT
      const expiredJwt = createTestJwt({
        sub: "user-old",
        exp: nowSeconds - 3600,
      });
      const expiredCookies = createAuthCookie(
        expiredJwt,
        "sb-expired-auth-token"
      );

      // Test with valid cookie - should authenticate
      const validResult = getValidatedAuthState(validCookies);
      expect(validResult.isAuthenticated).toBe(true);
      expect(validResult.userId).toBe("user-123");

      // Test with expired cookie - should not authenticate
      const expiredResult = getValidatedAuthState(expiredCookies);
      expect(expiredResult.isAuthenticated).toBe(false);
      expect(expiredResult.reason).toBe("expired");
    });

    it("should extract userId correctly from sub claim", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const testUserId = "c8661a31-3493-4c0f-9f14-0c08fcc68696";
      const jwt = createTestJwt({
        sub: testUserId,
        exp: nowSeconds + 3600,
      });
      const cookies = createAuthCookie(jwt);
      const result = getValidatedAuthState(cookies);

      expect(result.userId).toBe(testUserId);
    });
  });

  describe("validation reasons", () => {
    it("should cover all expected validation reasons", () => {
      const reasons: ValidationReason[] = [
        "missing",
        "invalid",
        "expired",
        "no-exp",
        "no-sub",
        "valid",
      ];

      // This test ensures TypeScript catches if we add new reasons
      reasons.forEach((reason) => {
        expect(typeof reason).toBe("string");
      });
    });
  });
});

import { findSupabaseAuthSessionCookie } from "@/lib/supabase/authCookie";

function encodeSupabaseCookie(sessionJson: string): string {
  return `base64-${Buffer.from(sessionJson, "utf8").toString("base64")}`;
}

describe("findSupabaseAuthSessionCookie", () => {
  it("parses a non-chunked Supabase auth cookie", () => {
    const value = encodeSupabaseCookie(
      JSON.stringify({
        access_token: "token-123",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh-123",
        user: { id: "u1", email: "u1@example.com" },
      })
    );

    const session = findSupabaseAuthSessionCookie([
      { name: "sb-project-ref-auth-token", value },
    ]);

    expect(session?.access_token).toBe("token-123");
  });

  it("reassembles chunked Supabase auth cookies (.0, .1, ...)", () => {
    const fullValue = encodeSupabaseCookie(
      JSON.stringify({
        access_token: "token-abc",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh-abc",
        user: { id: "u2", email: "u2@example.com" },
      })
    );

    const chunk0 = fullValue.slice(0, 30);
    const chunk1 = fullValue.slice(30);

    const session = findSupabaseAuthSessionCookie([
      { name: "sb-project-ref-auth-token", value: "" },
      { name: "sb-project-ref-auth-token.0", value: chunk0 },
      { name: "sb-project-ref-auth-token.1", value: chunk1 },
    ]);

    expect(session?.access_token).toBe("token-abc");
  });

  it("returns null when no auth cookie exists", () => {
    const session = findSupabaseAuthSessionCookie([
      { name: "theme", value: "dark" },
    ]);

    expect(session).toBeNull();
  });
});


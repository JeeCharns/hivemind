import { NextResponse } from "next/server";
import { cookies } from "next/headers";

function isSupabaseAuthCookieName(name: string): boolean {
  // cookieStorage + Supabase use keys like:
  // - sb-<project-ref>-auth-token
  // - sb-<project-ref>-auth-token.0 / .1 (chunked)
  // - sb-<project-ref>-auth-token-code-verifier (PKCE)

  // IMPORTANT: Don't clear the code-verifier cookie!
  // Users may logout and then click a magic link that was sent before logout.
  // The code verifier must persist for the PKCE flow to work.
  if (name.includes("code-verifier")) {
    return false;
  }

  return name.startsWith("sb-") && name.includes("auth-token");
}

/**
 * GET /api/auth/logout
 * Clears Supabase auth cookies and redirects to /login.
 *
 * Useful as a deterministic logout endpoint in dev where client-side effects
 * can run more than once.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const namesToClear = cookieStore
    .getAll()
    .map((c) => c.name)
    .filter(isSupabaseAuthCookieName);

  // Redirect to login without the 'next' parameter to avoid redirect loops
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("logged_out", "true");
  const response = NextResponse.redirect(loginUrl);

  for (const name of namesToClear) {
    response.cookies.set({
      name,
      value: "",
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
  }

  return response;
}


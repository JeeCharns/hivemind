import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getValidatedAuthState,
  logAuthValidation,
} from "./sessionValidation";

/**
 * Protected route prefixes
 * Any route starting with these requires authentication
 */
const PROTECTED_PREFIXES = [
  "/hives",
  "/settings",
  "/profile",
  "/admin",
];

/**
 * Public routes that should redirect if authenticated
 */
const GUEST_ONLY_ROUTES = ["/login", "/register"];

/**
 * Auth middleware for Next.js
 * Protects routes and handles redirects based on auth state
 */
export async function authMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, etc.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.(jpg|jpeg|png|gif|svg|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Check if route is protected
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  const isGuestOnlyRoute = GUEST_ONLY_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Get validated auth state (single source of truth)
  const allCookies = request.cookies.getAll().map((c) => ({
    name: c.name,
    value: c.value,
  }));
  const authState = getValidatedAuthState(allCookies);
  const isAuthenticated = authState.isAuthenticated;

  // Redirect unauthenticated users from protected routes
  if (isProtectedRoute && !isAuthenticated) {
    logAuthValidation(pathname, authState, "redirect to /login (protected route)");
    const url = new URL("/login", request.url);
    // Preserve intended destination (only for protected routes)
    if (pathname !== "/login" && isValidReturnUrl(pathname)) {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users from guest-only routes
  if (isGuestOnlyRoute && isAuthenticated) {
    logAuthValidation(pathname, authState, "redirect from guest-only route");
    // Check for return URL in query params
    const nextParam = request.nextUrl.searchParams.get("next");
    if (nextParam && isValidReturnUrl(nextParam)) {
      return NextResponse.redirect(new URL(nextParam, request.url));
    }
    // Default redirect to hives
    return NextResponse.redirect(new URL("/hives", request.url));
  }

  // Log successful auth check (no redirect)
  if (isProtectedRoute || isGuestOnlyRoute) {
    logAuthValidation(pathname, authState, "allow through");
  }

  return NextResponse.next();
}

/**
 * Validate return URL for security
 */
function isValidReturnUrl(url: string): boolean {
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.includes("://")) return false;
  return true;
}

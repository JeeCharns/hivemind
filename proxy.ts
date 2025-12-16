import { authMiddleware } from "./lib/auth/server/middleware";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 proxy entry point
 * Delegates to auth middleware for route protection
 * Note: In Next.js 16, middleware.ts has been renamed to proxy.ts
 */
export default function proxy(request: NextRequest) {
  return authMiddleware(request);
}

/**
 * Configure which routes proxy runs on
 * Runs on all routes except API, static files, etc.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

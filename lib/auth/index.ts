/**
 * Session Management Public API
 *
 * This module provides a comprehensive session management system
 * following SOLID principles and security best practices.
 *
 * @example
 * ```tsx
 * import { useSession, AuthGuard } from '@/lib/auth';
 *
 * function MyComponent() {
 *   const { user, isAuthenticated } = useSession();
 *
 *   return (
 *     <AuthGuard>
 *       <div>Welcome, {user?.name}</div>
 *     </AuthGuard>
 *   );
 * }
 * ```
 */

// React hooks and components
export { AuthProvider, notifySessionChange } from "./react/AuthProvider";
export { useSession } from "./react/useSession";
export { useRequireAuth } from "./react/useRequireAuth";
export { AuthGuard } from "./react/AuthGuard";
export { GuestGuard } from "./react/GuestGuard";

// Server-side utilities
export { requireAuth, getServerSession } from "./server/requireAuth";

// Types
export type {
  SessionStatus,
  SessionUser,
  Session,
  SessionState,
  ISessionClient,
  ISessionStore,
} from "./domain/session.types";

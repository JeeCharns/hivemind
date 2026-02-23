/**
 * Guest Access — Barrel Export
 *
 * Re-exports all guest access services and schemas from a single entry point.
 */

export {
  createShareLink,
  getShareLink,
  revokeShareLink,
  resolveShareToken,
  guestUrl,
} from "./conversationShareLinkService";

export {
  createGuestSession,
  validateGuestSession,
  getGuestSessionCookie,
  clearGuestSessionCookie,
  GUEST_SESSION_COOKIE,
} from "./guestSessionService";

export type {
  GuestSessionRecord,
  ValidatedGuestSession,
} from "./guestSessionService";

export { requireGuestSession } from "./requireGuestSession";
export type { GuestRouteContext } from "./requireGuestSession";

export {
  shareLinkExpirySchema,
  createShareLinkSchema,
  shareTokenSchema,
  guestSessionCookieSchema,
  guestCreateResponseSchema,
  guestSubmitFeedbackSchema,
} from "./schemas";

export type {
  ShareLinkExpiryInput,
  CreateShareLinkInput,
  GuestCreateResponseInput,
  GuestSubmitFeedbackInput,
} from "./schemas";

export { GuestFeedbackClient } from "./guestFeedbackClient";

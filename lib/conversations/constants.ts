/**
 * Conversation Constants
 *
 * Centralised constants for conversation-related operations.
 */

/**
 * System user UUID for guest operations.
 *
 * Used as user_id when guests submit responses, likes, or feedback.
 * This satisfies the NOT NULL foreign key constraint on user_id columns.
 * Guest attribution is tracked via the guest_session_id column.
 */
export const SYSTEM_USER_ID = "c8661a31-3493-4c0f-9f14-0c08fcc68696";

/**
 * Maximum number of responses a guest can submit per session.
 *
 * Prevents abuse while allowing reasonable workshop participation.
 */
export const GUEST_MAX_RESPONSES_PER_SESSION = 10;

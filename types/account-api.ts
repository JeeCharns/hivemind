/**
 * Account API Types
 *
 * Request/response types for account-related API endpoints
 */

export interface AccountSettingsResponse {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface UpdateAccountProfileResponse {
  displayName: string;
  avatarUrl: string | null;
}

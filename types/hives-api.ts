import type { ApiErrorShape } from "./api";

export type CreateHiveRequest = {
  name: string;
  logo_url?: string;
};

export type HiveRow = {
  id: string;
  slug?: string | null;
  name: string;
  logo_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CreateHiveResponse = HiveRow;

export type HiveStatsResponse = {
  conversationsCount: number;
  membersCount: number;
  lastActivity: string | null;
};

export type InviteEmailsRequest = {
  emails: string[];
};

export type HiveInviteRow = {
  id: string;
  hive_id: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
};

export type ListInvitesResponse = HiveInviteRow[];

export type HivesApiError = ApiErrorShape;


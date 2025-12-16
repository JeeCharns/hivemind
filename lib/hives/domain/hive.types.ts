/**
 * Hive Domain Types
 *
 * Domain types and interfaces following DIP (Dependency Inversion Principle)
 */

export interface Hive {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HiveMember {
  hive_id: string;
  user_id: string;
  role: HiveRole;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

export type HiveRole = "admin" | "member";

export interface HiveStats {
  conversationsCount: number;
  membersCount: number;
  lastActivity?: string;
}

export interface HiveInvite {
  id: string;
  hive_id: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
}

export interface CreateHiveInput {
  name: string;
  logo_url?: string;
}

export interface UpdateHiveInput {
  name?: string;
  logo_url?: string;
}

/**
 * IHiveClient interface (Dependency Inversion)
 * Abstracts the data fetching implementation
 */
export interface IHiveClient {
  listHives(): Promise<Hive[]>;
  getHive(hiveId: string): Promise<Hive>;
  getHiveStats(hiveId: string): Promise<HiveStats>;
  createHive(input: CreateHiveInput): Promise<Hive>;
  updateHive(hiveId: string, input: UpdateHiveInput): Promise<Hive>;
  deleteHive(hiveId: string): Promise<void>;
  listInvites(hiveId: string): Promise<HiveInvite[]>;
  createInvite(hiveId: string, emails: string[]): Promise<void>;
  revokeInvite(hiveId: string, inviteId: string): Promise<void>;
}

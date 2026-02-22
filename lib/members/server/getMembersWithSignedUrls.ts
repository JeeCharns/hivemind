/**
 * Get Members with Signed URLs - Server-Side Data Access
 *
 * Fetches hive members and resolves avatar paths to signed URLs
 * Follows SOLID principles:
 * - SRP: Single responsibility of fetching member data
 * - Security: Verifies user membership before returning data
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberViewModel } from "@/types/members";
import { checkHiveMembership } from "@/lib/navbar/data/hiveRepository";

interface MemberQueryResult {
  user_id: string;
  role: string;
  profiles: {
    id: string;
    display_name: string | null;
    avatar_path: string | null;
  } | null;
}

/**
 * Fetch members for a hive with signed avatar URLs
 *
 * Security:
 * - Verifies requester is a member of the hive
 * - Generates signed URLs for private avatar storage
 *
 * @param supabase - Supabase client
 * @param hiveId - Hive UUID
 * @param requesterId - User UUID of requester
 * @returns Array of member view models
 * @throws Error if requester is not a member or query fails
 */
export async function getMembersWithSignedUrls(
  supabase: SupabaseClient,
  hiveId: string,
  requesterId: string
): Promise<MemberViewModel[]> {
  // 1. Security: Verify requester is a member
  const isMember = await checkHiveMembership(supabase, requesterId, hiveId);
  if (!isMember) {
    throw new Error("Unauthorized: User is not a member of this hive");
  }

  // 2. Fetch members with user details
  const { data: members, error } = await supabase
    .from("hive_members")
    .select(
      `
      user_id,
      role,
      profiles:user_id (
        id,
        display_name,
        avatar_path
      )
    `
    )
    .eq("hive_id", hiveId);

  if (error) {
    throw new Error(`Failed to fetch members: ${error.message}`);
  }

  if (!members) {
    return [];
  }

  // 3. Transform to view models with signed URLs
  const membersWithSignedUrls = await Promise.all(
    (members as unknown as MemberQueryResult[]).map(async (member) => {
      let signedAvatarUrl: string | null = null;

      // Extract avatar path from profile
      const avatarPath = member.profiles?.avatar_path;

      if (avatarPath && !avatarPath.startsWith("http")) {
        try {
          // Generate signed URL for private storage
          const { data, error: signError } = await supabase.storage
            .from("user-avatars")
            .createSignedUrl(avatarPath, 3600); // 1 hour expiry

          if (!signError && data?.signedUrl) {
            signedAvatarUrl = data.signedUrl;
          }
        } catch (err) {
          console.warn(
            `Failed to sign avatar URL for user ${member.user_id}:`,
            err
          );
        }
      } else if (avatarPath?.startsWith("http")) {
        // Already a full URL (e.g., OAuth provider avatar)
        signedAvatarUrl = avatarPath;
      }

      // Extract display name from profile
      const displayName = member.profiles?.display_name || "Unknown User";

      return {
        userId: member.user_id,
        displayName,
        avatarUrl: signedAvatarUrl,
        role: member.role as "admin" | "member",
      };
    })
  );

  return membersWithSignedUrls;
}

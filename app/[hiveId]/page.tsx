import { redirect } from "next/navigation";

/**
 * Top-level hive redirect
 *
 * Consolidates legacy /:hiveId paths under /hives/:hiveId
 */
export default async function HiveRedirectPage({
  params,
}: {
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId } = await params;
  redirect(`/hives/${hiveId}`);
}

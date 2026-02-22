import { redirect } from "next/navigation";
import { supabaseAdminClient } from "@/lib/supabase/adminClient";
import { inviteTokenSchema } from "@/lib/hives/schemas";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import InviteAcceptClient from "./InviteAcceptClient";
import CenteredCard from "@/app/components/centered-card";
import BrandLogo from "@/app/components/brand-logo";
import Alert from "@/app/components/alert";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

/**
 * Public invite acceptance page (server component).
 *
 * If not authenticated: sets invite cookie and redirects to login with hiveName param.
 * If authenticated: renders client component to accept the invite.
 */
export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  // Validate token format
  const parsed = inviteTokenSchema.safeParse({ token });
  if (!parsed.success) {
    return (
      <InviteErrorPage
        title="Invalid Invite Link"
        message="This invite link is not valid. Please check the link and try again."
      />
    );
  }

  // Fetch invite link and hive name server-side
  const supabase = supabaseAdminClient();
  const { data: inviteLink, error: linkError } = await supabase
    .from("hive_invite_links")
    .select("hive_id, access_mode, hives(name)")
    .eq("token", token)
    .maybeSingle();

  if (linkError) {
    console.error("[InvitePage] Error fetching invite link:", linkError);
    return (
      <InviteErrorPage
        title="Something Went Wrong"
        message="We couldn't load this invite. Please try again later."
      />
    );
  }

  if (!inviteLink) {
    return (
      <InviteErrorPage
        title="Invite Not Found"
        message="This invite link doesn't exist or has expired."
      />
    );
  }

  // Extract hive name from nested relation
  const hive = inviteLink.hives as unknown as { name?: string } | null;
  const hiveName = hive?.name || "this hive";

  // Check if user is authenticated
  const session = await getServerSession();

  if (!session) {
    // Not authenticated - redirect to login (cookie is set by login page via API)
    const loginUrl = new URL(
      "/login",
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    );
    loginUrl.searchParams.set("intent", "join");
    loginUrl.searchParams.set("invite", token);
    loginUrl.searchParams.set("hiveName", hiveName);

    redirect(loginUrl.pathname + loginUrl.search);
  }

  // User is authenticated - render client component to accept invite
  return <InviteAcceptClient token={token} hiveName={hiveName} />;
}

/**
 * Error state component for invite page
 */
function InviteErrorPage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="min-h-screen w-full bg-[#F0F0F5] flex flex-col items-center justify-center relative overflow-hidden px-4 py-12">
      <div className="mb-12">
        <BrandLogo size={42} />
      </div>

      <CenteredCard
        className="items-center gap-4 shadow-md border border-[#E2E8F0] p-8"
        widthClass="max-w-full"
        style={{ width: 473, maxWidth: "100%" }}
      >
        <h1
          className="text-center text-[#172847] text-2xl font-semibold leading-[31px]"
          style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}
        >
          {title}
        </h1>
        <Alert variant="error">{message}</Alert>
      </CenteredCard>
    </div>
  );
}

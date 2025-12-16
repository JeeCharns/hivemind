import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";

/**
 * GET /api/auth/session
 * Returns current user session
 * Used by client-side session management
 */
export async function GET() {
  try {
    const session = await getServerSession();

    if (!session) {
      // Return 200 for unauthenticated to avoid noisy console errors on the client.
      return NextResponse.json({ user: null }, { status: 200 });
    }

    return NextResponse.json({
      user: session.user,
      activeHiveId: session.activeHiveId,
      roles: session.roles,
    });
  } catch (error) {
    // If auth/session parsing fails, treat as unauthenticated rather than crashing the app.
    console.error("Session API error:", error);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}

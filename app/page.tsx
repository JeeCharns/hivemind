import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";

export default async function Page() {
  const session = await getServerSession();
  redirect(session ? "/hives" : "/login?next=/hives");
}

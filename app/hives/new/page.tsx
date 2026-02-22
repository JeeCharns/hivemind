import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import NewHiveWizard from "./new-hive-wizard";

export default async function NewHivePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  return <NewHiveWizard />;
}

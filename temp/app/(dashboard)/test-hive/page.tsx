import HiveClientGuard from "@/app/(dashboard)/hives/[hiveId]/client-guard";
import TestHiveClient from "./TestHiveClient";

export default function Page() {
  return (
    <HiveClientGuard>
      <TestHiveClient />
    </HiveClientGuard>
  );
}

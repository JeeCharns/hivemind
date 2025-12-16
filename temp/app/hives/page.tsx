"use server";

import { Suspense } from "react";
import HivesClient from "./hives-client";
import { AvatarSkeleton, Skeleton, TextSkeleton } from "@/components/skeleton";

function HivesSkeleton() {
  return (
    <div className="w-full max-w-[480px] bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-4">
      <h1 className="text-2xl font-semibold text-[#172847]">Your Hives</h1>
      <p className="text-sm text-[#566175] text-center">
        Select a hive to continue.
      </p>
      <div className="w-full flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-full border border-slate-200 rounded-lg px-4 py-6 flex items-center gap-2 bg-slate-100/60"
          >
            <AvatarSkeleton className="h-12 w-12" />
            <TextSkeleton className="flex-1 h-4" />
          </div>
        ))}
        <Skeleton className="w-full h-10 rounded-lg" />
      </div>
    </div>
  );
}

export default async function HiveListPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 relative">
      <Suspense fallback={<HivesSkeleton />}>
        <HivesClient />
      </Suspense>
    </div>
  );
}

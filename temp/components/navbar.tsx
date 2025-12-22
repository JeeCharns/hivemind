"use client";

import OrgSelector, { OrgOption, OrgSelectorSkeleton } from "@/components/org-selector";
import PageSelector from "@/app/components/navbar/pageselector";
import UserSelector from "@/components/user-selector";
import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Breadcrumb from "./breadcrumb";
import RouteLogger from "./route-logger";
import { supabaseBrowserClient } from "@/lib/supabase/client";

type NavbarProps = {
  profileName?: string;
  profileAvatarPath?: string | null;
  hiveName?: string;
  hiveLogo?: string | null;
  hiveId?: string;
  hiveSlug?: string | null;
  orgs?: OrgOption[];
};

export default function Navbar({
  profileName,
  profileAvatarPath,
  hiveName,
  hiveLogo,
  hiveId,
  hiveSlug,
  orgs = [],
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>(orgs);
  const [orgLoading, setOrgLoading] = useState(orgs.length === 0);
  const supabase = supabaseBrowserClient;
  const isHivesHome = pathname === "/hives";
  const isAccount = pathname === "/account";
  const isHiveRoot =
    !!hiveId &&
    (pathname === `/hives/${hiveId}` || pathname === `/hives/${hiveId}/`);

  useEffect(() => {
    // If orgs were provided via props, keep them; otherwise load memberships.
    if (orgs.length > 0) {
      setOrgOptions(orgs);
      setOrgLoading(false);
      return;
    }
    if (!supabase) return;
    const loadOrgs = async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) {
        setOrgLoading(false);
        return;
      }
      const { data: memberships, error } = await supabase
        .from("hive_members")
        .select("hives(id, slug, name)")
        .eq("user_id", userId);
      if (error) {
        console.error("[navbar] hive_members fetch error", error);
        setOrgLoading(false);
        return;
      }
      const mapped =
        memberships
          ?.map((row: { hives: { id: string; slug?: string | null; name?: string | null } | { id: string; slug?: string | null; name?: string | null }[] | null }) => {
            const hiveRel = Array.isArray(row.hives) ? row.hives[0] : row.hives;
            if (!hiveRel?.id) return null;
            const slug = hiveRel.slug ?? hiveRel.id;
            return {
              id: hiveRel.id,
              slug,
              name: hiveRel.name ?? slug,
            } as OrgOption;
          })
          .filter(Boolean) ?? [];
      setOrgOptions(mapped as OrgOption[]);
      setOrgLoading(false);
    };
    void loadOrgs();
  }, [orgs, supabase]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-slate-100">
      <RouteLogger />
      <div className="h-full mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12 flex items-center justify-between py-1">
        <div className="flex items-center gap-3">
          <Link href="/hives" className="flex items-center gap-2">
            <Image
              src="/HiveLogo.png"
              alt="Hive logo"
              width={160}
              height={27}
              style={{ width: "auto", height: "auto" }}
              priority
            />
          </Link>
          <Breadcrumb
            segments={[
              orgLoading ? (
                <OrgSelectorSkeleton />
              ) : (
                <OrgSelector orgs={orgOptions} />
              ),
              <Suspense
                fallback={
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-20 rounded bg-slate-200 animate-pulse" />
                    <div className="h-8 w-8 rounded-md border border-slate-200 bg-slate-50 animate-pulse" />
                  </div>
                }
              >
                <PageSelector hiveId={hiveId} hiveSlug={hiveSlug ?? undefined} />
              </Suspense>,
            ]}
          />
        </div>

        <UserSelector
          displayName={profileName}
          avatarPath={profileAvatarPath ?? null}
        />
      </div>
    </nav>
  );
}

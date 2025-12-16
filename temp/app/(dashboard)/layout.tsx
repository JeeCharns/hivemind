import Navbar from "@/components/navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar
        hiveId={undefined}
        hiveName={undefined}
        hiveSlug={undefined}
        hiveLogo={undefined}
        profileName={undefined}
        profileAvatarPath={null}
      />
      <main className="flex-1 pt-20 pb-10">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12">
          {children}
        </div>
      </main>
    </div>
  );
}

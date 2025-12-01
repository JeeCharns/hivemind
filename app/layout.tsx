import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_HIVE_ID, DEFAULT_USER_ID } from "@/lib/config";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HiveMind",
  description: "Understand your organisation from the bottom up",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = supabaseServerClient();

  const [{ data: profile }, { data: hive }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", DEFAULT_USER_ID)
      .maybeSingle(),
    supabase
      .from("hives")
      .select("name")
      .eq("id", DEFAULT_HIVE_ID)
      .maybeSingle(),
  ]);

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        <Navbar profileName={profile?.display_name} hiveName={hive?.name} />
        <main className="min-h-screen bg-[#E8EAF3] pt-24 pb-16 overflow-y-auto no-scrollbar">
          <div className="mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}

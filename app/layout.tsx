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
        <main className="pl-96 pr-8 pt-8 min-h-screen overflow-y-auto no-scrollbar">
          <section
            className="
              mx-auto 
              w-[688px]
              bg-white
              rounded-2xl
              border border-slate-200
              overflow-visible
              p-0
              flex flex-col
            "
          >
            {children}
          </section>
        </main>
      </body>
    </html>
  );
}

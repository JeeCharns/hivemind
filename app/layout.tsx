import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      {/* `font-sans` now resolves to Space Grotesk by our @theme override */}
      <body className="font-sans antialiased">
        <Navbar />
        <main className="pl-96 pr-8 pt-8 h-screen">
          <section
            className="
      mx-auto 
      w-[688px]
      h-[calc(100vh-32px)]   /* 32px = pt-8 = top gap */
      bg-white
      rounded-t-2xl          /* ✅ only top corners */
      overflow-y-auto        /* ✅ scroll inside */
      p-8
    "
          >
            {children}
          </section>
        </main>
      </body>
    </html>
  );
}

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
      <body className="font-sans antialiased">
        <Navbar />
        <main className="pl-96 pr-8 pt-8 h-screen">
          <section
            className="
              mx-auto 
              w-[688px]
              h-[calc(100vh-32px)]
              bg-white
              rounded-2xl
              border border-slate-200
              overflow-hidden
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

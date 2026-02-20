import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/react/AuthProvider";

export const metadata: Metadata = {
  title: {
    default: "Hive",
    template: "%s | Hive",
  },
  description: "Collective decision-making for communities",
  icons: {
    icon: [{ url: "/HiveFavicon.png", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Hive",
    description: "Collective decision-making for communities",
    url: "https://app.hiveonline.io",
    siteName: "Hive",
    images: [
      {
        url: "/HiveSocialBanner.png",
        width: 1200,
        height: 630,
        alt: "Hive - Collective decision-making",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hive",
    description: "Collective decision-making for communities",
    images: ["/HiveSocialBanner.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

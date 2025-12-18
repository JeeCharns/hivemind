import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/react/AuthProvider";

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

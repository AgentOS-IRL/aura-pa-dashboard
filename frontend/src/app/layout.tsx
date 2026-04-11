import type { Metadata } from "next";
import "./globals.css";
import AppShell from "../components/AppShell";
import { SessionProvider } from "./context/session";
import { AURA_BASE_PATH } from "./lib/auraPath";

const iconPrefix = AURA_BASE_PATH === "/" ? "" : AURA_BASE_PATH;

export const metadata: Metadata = {
  title: "Aura PA Dashboard",
  description:
    "Real-time patient administration insights that keep Aura's teams aligned across clinic, scheduling, and triage workflows.",
  icons: {
    icon: `${iconPrefix}/favicon.ico`,
    shortcut: `${iconPrefix}/favicon.ico`,
    apple: `${iconPrefix}/apple-touch-icon.png`,
    other: [
      {
        rel: "icon",
        url: `${iconPrefix}/icon-192x192.png`,
        sizes: "192x192",
      },
      {
        rel: "icon",
        url: `${iconPrefix}/icon-512x512.png`,
        sizes: "512x512",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}

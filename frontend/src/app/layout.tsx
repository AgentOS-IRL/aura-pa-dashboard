import type { Metadata } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura PA Dashboard",
  description:
    "Real-time patient administration insights that keep Aura's teams aligned across clinic, scheduling, and triage workflows.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
    other: [
      {
        rel: "icon",
        url: "/icon-192x192.png",
        sizes: "192x192",
      },
      {
        rel: "icon",
        url: "/icon-512x512.png",
        sizes: "512x512",
      },
    ],
  },
};

const navigationItems = [
  { label: "Home", href: "/" },
  { label: "Transcript", href: "/transcript" },
];

function AppShell({ children }: { children: React.ReactNode }) {
  "use client";

  const pathname = usePathname() ?? "/";

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__header-inner responsive-card-padding">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                Aura PA
              </p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-white">Personal Assistant</p>
            </div>
            <nav className="app-shell__nav" aria-label="Primary">
              <ul className="flex flex-wrap gap-2">
                {navigationItems.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`nav-link ${isActive ? "nav-link--active" : ""}`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Switch between the live assistant and the transcript placeholder while we prepare the history persistence layer.
          </p>
        </div>
      </header>
      <main className="app-shell__content responsive-card-padding">{children}</main>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

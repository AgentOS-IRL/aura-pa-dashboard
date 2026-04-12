"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { stripAuraBasePath } from "../app/lib/auraPath";

const navigationItems = [
  { label: "Home", href: "/" },
  { label: "Transcript", href: "/transcript" },
  { label: "Configuration", href: "/configuration" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const normalizedPath = stripAuraBasePath(pathname);

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
                  const isActive = normalizedPath === item.href;

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

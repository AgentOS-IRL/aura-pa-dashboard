"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Settings } from "lucide-react";
import { stripAuraBasePath } from "../app/lib/auraPath";

const navigationItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "Fleeting Notes", href: "/fleeting-notes", icon: LayoutGrid },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const normalizedPath = stripAuraBasePath(pathname);

  return (
    <div className="app-shell min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="app-shell__header sticky top-0 z-20 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/80">
        <div className="app-shell__header-inner px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] md:tracking-[0.4em] text-slate-500 dark:text-slate-400 font-medium">
                Aura PA
              </p>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                Personal Assistant
              </h1>
            </div>
            <nav className="hidden md:flex items-center" aria-label="Desktop Primary">
              <ul className="flex items-center gap-1 lg:gap-2">
                {navigationItems.map((item) => {
                  const isActive = normalizedPath === item.href;
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
                          isActive 
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" 
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
          <p className="mt-1 hidden md:block text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Switch between the live assistant and the transcript placeholder while we prepare the history persistence layer.
          </p>
        </div>
      </header>

      <main className="app-shell__content px-4 py-6 md:px-8 md:py-10 max-w-7xl mx-auto pb-24 md:pb-10">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav 
        className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/95 dark:bg-slate-950/95 border-t border-slate-200/80 dark:border-slate-800/80 backdrop-blur-lg pb-safe"
        aria-label="Mobile Primary"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navigationItems.map((item) => {
            const isActive = normalizedPath === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 w-full h-full rounded-xl transition-all duration-200 ${
                  isActive 
                    ? "text-slate-900 dark:text-white" 
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <div className={`relative p-1 rounded-lg transition-all duration-200 ${
                  isActive ? "bg-slate-100 dark:bg-slate-800" : ""
                }`}>
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-slate-900 dark:bg-white" />
                  )}
                </div>
                <span className="text-[10px] font-semibold tracking-wide uppercase">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

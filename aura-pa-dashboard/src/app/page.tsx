"use client";

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const Assistant = dynamic(() => import('./components/Assistant'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      <p className="text-slate-600 dark:text-slate-400 font-bold">Initializing Personal Assistant...</p>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-12">
        <header className="text-center space-y-4">
          <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 tracking-tight">
            Aura Assistant
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Your personal, intelligent voice companion. Speak naturally and let Aura capture your thoughts.
          </p>
        </header>

        <Assistant />
      </div>
    </main>
  );
}

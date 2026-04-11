import Link from "next/link";

export default function TranscriptPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4 text-center md:space-y-6 mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Transcript</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white">Transcript history coming soon</h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300">
          We are stitching together the persistence layer so your conversations can be replayed securely. For now, the
          transcript tab is a placeholder while the assistant page captures live interactions.
        </p>
      </section>

      <div className="placeholder-panel w-full max-w-4xl mx-auto">
        <p className="text-base text-slate-700 dark:text-slate-200">
          This space will eventually list every accepted response and voice chunk from the assistant. Until the backend
          storage is in place, please use the Home tab to speak to Aura and monitor upload status in real time.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="nav-link nav-link--active text-sm px-4 py-2"
            aria-label="Go back to the assistant"
          >
            Return to assistant
          </Link>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Check back once we expose your saved transcripts.
          </span>
        </div>
      </div>
    </div>
  );
}

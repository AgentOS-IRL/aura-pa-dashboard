"use client";

import { RefreshCw, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchClassificationStats, type ClassificationStats } from "../lib/classifications";
import { fetchTranscripts, type TranscriptRecord } from "../lib/transcripts";

const formatReceivedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return parsed.toLocaleString();
};

export default function FleetingNotesPage() {
  const [stats, setStats] = useState<ClassificationStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null);
  const [selectedClassificationName, setSelectedClassificationName] = useState<string>("");

  const loadStats = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const data = await fetchClassificationStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStats(true);
  }, [loadStats]);

  const handleCardClick = (id: string, name: string) => {
    setSelectedClassificationId(id);
    setSelectedClassificationName(name);
  };

  const closeModal = () => {
    setSelectedClassificationId(null);
    setSelectedClassificationName("");
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4 text-center md:space-y-6 mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Insights</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white">Fleeting Notes</h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300">
          Explore your captured thoughts organized by classification. Click a card to view detailed transcripts.
        </p>
        <button
          type="button"
          onClick={() => loadStats()}
          disabled={refreshing || loading}
          className="mx-auto flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Stats
        </button>
      </section>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-slate-600 dark:text-slate-400 font-bold">Loading classification stats...</p>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-900/10">
          <p className="text-rose-600 dark:text-rose-400 font-semibold">Failed to load classification stats</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((item) => (
            <button
              key={item.id}
              onClick={() => handleCardClick(item.id, item.name)}
              className="flex flex-col text-left rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-xl transition hover:border-slate-400 dark:border-slate-800/60 dark:bg-slate-900/70 dark:hover:border-slate-600"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{item.name}</h3>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-0.5 text-sm font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {item.count}
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3 flex-grow">
                {item.description || "No description provided."}
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                View Transcripts →
              </div>
            </button>
          ))}
          {stats.length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-500 dark:text-slate-400">
              No classifications found. Add some in the Settings tab.
            </div>
          )}
        </div>
      )}

      {selectedClassificationId && (
        <TranscriptModal
          classificationId={selectedClassificationId}
          classificationName={selectedClassificationName}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function TranscriptModal({
  classificationId,
  classificationName,
  onClose
}: {
  classificationId: string;
  classificationName: string;
  onClose: () => void;
}) {
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const loadTranscripts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTranscripts({
        classificationId,
        page,
        limit: 10
      });
      setTranscripts(data.transcripts);
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [classificationId, page]);

  useEffect(() => {
    loadTranscripts();
  }, [loadTranscripts]);

  // Handle escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-2xl dark:border-slate-800/60 dark:bg-slate-900 flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{classificationName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{total} transcripts found</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-grow overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-500">Loading transcripts...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-900/10">
              <p className="text-rose-600 font-semibold">Error loading transcripts</p>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          ) : transcripts.length === 0 ? (
            <div className="py-20 text-center text-slate-500 dark:text-slate-400">
              No transcripts found for this classification.
            </div>
          ) : (
            transcripts.map((record) => (
              <article
                key={record.id}
                className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 space-y-3 dark:border-slate-800 dark:bg-slate-950/20"
              >
                <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>{formatReceivedAt(record.receivedAt)}</span>
                  <span className="font-mono uppercase tracking-wider">{record.sessionId}</span>
                </div>
                <p className="text-base text-slate-900 dark:text-slate-100 leading-relaxed">
                  {record.payload}
                </p>
              </article>
            ))
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 p-6 dark:border-slate-800">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Page {page}
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Previous
            </button>
            <button
              disabled={!hasMore || loading}
              onClick={() => setPage(p => p + 1)}
              className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useSessionContext } from "../context/session";
import { fetchTranscripts, type TranscriptRecord } from "../lib/transcripts";

const formatReceivedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return parsed.toLocaleString();
};

export default function TranscriptPage() {
  const { sessionId } = useSessionContext();
  const [manualSessionId, setManualSessionId] = useState("");
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const TRANSCRIPTS_PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationMeta, setPaginationMeta] = useState({
    total: 0,
    limit: TRANSCRIPTS_PAGE_SIZE,
    hasMore: false
  });
  const lastSessionRef = useRef<string | null>(null);

  const activeSessionId = useMemo(() => {
    const override = manualSessionId.trim();
    return override || sessionId;
  }, [manualSessionId, sessionId]);

  useEffect(() => {
    let canceled = false;

    if (!activeSessionId) {
      setTranscripts([]);
      setError(null);
      setLoading(false);
      setPaginationMeta({ total: 0, limit: TRANSCRIPTS_PAGE_SIZE, hasMore: false });
      lastSessionRef.current = null;
      return;
    }

    if (lastSessionRef.current !== activeSessionId) {
      setCurrentPage(1);
      setPaginationMeta({ total: 0, limit: TRANSCRIPTS_PAGE_SIZE, hasMore: false });
      lastSessionRef.current = activeSessionId;
      return;
    }

    setLoading(true);
    setError(null);

    fetchTranscripts(activeSessionId, { limit: TRANSCRIPTS_PAGE_SIZE, page: currentPage })
      .then((data) => {
        if (canceled) {
          return;
        }
        setTranscripts(data.transcripts);
        setPaginationMeta({ total: data.total, limit: data.limit, hasMore: data.hasMore });
      })
      .catch((err) => {
        if (canceled) {
          return;
        }
        setTranscripts([]);
        setPaginationMeta({ total: 0, limit: TRANSCRIPTS_PAGE_SIZE, hasMore: false });
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
          lastSessionRef.current = activeSessionId;
        }
      });

    return () => {
      canceled = true;
    };
  }, [activeSessionId, currentPage, refreshIndex]);

  const handleRefresh = () => {
    if (!activeSessionId) {
      return;
    }
    setRefreshIndex((prev) => prev + 1);
  };

  const handlePreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((page) => page + 1);
  };

  const limitForSummary = Math.max(1, paginationMeta.limit || TRANSCRIPTS_PAGE_SIZE);
  const totalEntries = paginationMeta.total;
  const totalPages = totalEntries > 0 ? Math.max(1, Math.ceil(totalEntries / limitForSummary)) : 1;
  const startEntry = totalEntries === 0 ? 0 : (currentPage - 1) * limitForSummary + 1;
  const endEntry = totalEntries === 0 ? 0 : Math.min(totalEntries, currentPage * limitForSummary);
  const isPreviousDisabled = currentPage <= 1 || loading;
  const isNextDisabled = !paginationMeta.hasMore || loading;

  const emptyState = () => (
    <div className="transcript-alert">
      <p className="text-base font-semibold">No transcripts yet</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Aura has not persisted any transcript chunks for this session yet. Start speaking on the Assistant tab or try refreshing in a moment.
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4 text-center md:space-y-6 mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Transcript</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white">Transcript history</h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300">
          Review the persisted conversation snippets that Aura captured for your current session. You can override the session ID
          manually if you need to inspect a different run.
        </p>
      </section>

      <section className="transcript-input-panel mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Active session ID</p>
            <p className="font-mono break-words text-slate-900 dark:text-slate-100">
              {activeSessionId ?? 'No session id yet'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={!activeSessionId || loading}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="manual-session" className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Manual session ID (optional)
          </label>
          <input
            id="manual-session"
            type="text"
            value={manualSessionId}
            onChange={(event) => setManualSessionId(event.target.value)}
            placeholder="Paste an existing session ID to inspect older transcripts"
            className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Leave this blank to use the session ID generated by the assistant automatically.
          </p>
        </div>
      </section>

      {error && (
        <div className="transcript-alert">
          <p className="text-base font-semibold text-rose-600">Unable to load transcripts</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      )}

      {loading && (
        <div className="transcript-alert flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Fetching transcripts…</p>
        </div>
      )}

      {!activeSessionId && !loading && !error && (
        <div className="transcript-alert">
          <p className="text-base font-semibold">No active session</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Wake the assistant on the Home tab to generate a session ID before transcripts become available.
          </p>
        </div>
      )}

      {activeSessionId && !loading && !error && transcripts.length === 0 && emptyState()}

      {activeSessionId && transcripts.length > 0 && (
        <section className="transcript-list mx-auto max-w-4xl">
          <ul className="space-y-4">
            {transcripts.map((record) => (
              <li key={`${record.sessionId}-${record.receivedAt}-${record.payload}`}>
                <article className="transcript-card">
                  <header className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {formatReceivedAt(record.receivedAt)}
                    </p>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {record.sessionId}
                    </span>
                  </header>
                  <p className="mt-3 text-base leading-relaxed text-slate-900 dark:text-slate-100">{record.payload}</p>
                  {record.metadata && (
                    <div className="transcript-card__metadata">
                      {Object.entries(record.metadata).map(([key, value]) => (
                        <span key={key} className="metadata-badge">
                          {key}: {typeof value === "string" ? value : JSON.stringify(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
          <div className="transcript-pagination">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                Page {currentPage} of {totalPages}
              </p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Showing entries {startEntry}–{endEntry} of {totalEntries}
              </p>
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                onClick={handlePreviousPage}
                disabled={isPreviousDisabled}
                className="pagination-button"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={!activeSessionId || loading}
                className="pagination-button"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={isNextDisabled}
                className="pagination-button"
              >
                Next
              </button>
            </div>
          </div>
          <div className="flex justify-end items-center mt-2 text-xs text-slate-500 dark:text-slate-400">
            <Link href="/" className="nav-link text-xs px-3 py-1" aria-label="Return to assistant">
              Back to Assistant
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

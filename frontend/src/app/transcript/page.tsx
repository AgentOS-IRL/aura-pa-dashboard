"use client";

import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteAllTranscripts, fetchTranscripts, type TranscriptRecord } from "../lib/transcripts";

const formatReceivedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return parsed.toLocaleString();
};

export default function TranscriptPage() {
  const TRANSCRIPTS_PAGE_SIZE = 25;
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationMeta, setPaginationMeta] = useState({
    total: 0,
    limit: TRANSCRIPTS_PAGE_SIZE,
    hasMore: false
  });

  useEffect(() => {
    let canceled = false;

    setLoading(true);
    setError(null);

    fetchTranscripts({ limit: TRANSCRIPTS_PAGE_SIZE, page: currentPage })
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
        }
      });

    return () => {
      canceled = true;
    };
  }, [currentPage, refreshIndex]);

  const handleRefresh = () => {
    setRefreshIndex((prev) => prev + 1);
  };

  const handleDeleteAll = async () => {
    if (deleting) {
      return;
    }

    const confirmed = window.confirm(
      'Delete all transcripts? This permanently removes every row from the global history.'
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteAllTranscripts();
      setCurrentPage(1);
      setRefreshIndex((prev) => prev + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const handlePreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1));
  };

  const handleNextPage = () => {
    if (!paginationMeta.hasMore) {
      return;
    }
    setCurrentPage((page) => page + 1);
  };

  const limitForSummary = Math.max(1, paginationMeta.limit || TRANSCRIPTS_PAGE_SIZE);
  const totalEntries = paginationMeta.total;
  const totalPages = totalEntries > 0 ? Math.max(1, Math.ceil(totalEntries / limitForSummary)) : 1;
  const startEntry = totalEntries === 0 ? 0 : (currentPage - 1) * limitForSummary + 1;
  const endEntry = totalEntries === 0 ? 0 : Math.min(totalEntries, currentPage * limitForSummary);
  const isPreviousDisabled = currentPage <= 1 || loading || deleting;
  const isNextDisabled = !paginationMeta.hasMore || loading || deleting;

  const emptyState = () => (
    <div className="transcript-alert">
      <p className="text-base font-semibold">No transcripts yet</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Aura has not persisted any transcripts yet. Wake the assistant or refresh in a moment to see newly recorded snippets.
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4 text-center md:space-y-6 mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Transcript</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white">Global transcript history</h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300">
          Browse every transcript row Aura has persisted, sorted by newest entries first. Use the pagination controls
          below to flip through older history.
        </p>
      </section>

      <section className="transcript-input-panel mx-auto max-w-4xl space-y-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Global transcript view</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing transcripts from every session, always sorted newest first.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || deleting}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={loading || deleting}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete all transcripts"
                )}
              </button>
            </div>
          </div>
        </section>

      {error && (
        <div className="transcript-alert">
          <p className="text-base font-semibold text-rose-600">Unable to load transcripts</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      )}

      {deleteError && (
        <div className="transcript-alert">
          <p className="text-base font-semibold text-rose-600">Unable to delete transcripts</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{deleteError}</p>
        </div>
      )}

      {loading && (
        <div className="transcript-alert flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Fetching transcripts…</p>
        </div>
      )}

      {!loading && !error && transcripts.length === 0 && emptyState()}

      {transcripts.length > 0 && (
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
                disabled={loading || deleting}
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

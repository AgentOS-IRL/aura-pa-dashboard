"use client";

import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchClassifications, type ClassificationRecord } from "../lib/classifications";
import { deleteTranscriptClassification, saveTranscriptClassification } from "../lib/transcriptClassifications";
import { deleteAllTranscripts, fetchTranscripts, type TranscriptRecord } from "../lib/transcripts";

const formatReceivedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return parsed.toLocaleString();
};

type AssignmentEntry = { loading: boolean; error: string | null };
type RemovalEntry = { loading: boolean; error: string | null };

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
  const [classificationCatalog, setClassificationCatalog] = useState<ClassificationRecord[]>([]);
  const [classificationCatalogLoading, setClassificationCatalogLoading] = useState(false);
  const [classificationCatalogError, setClassificationCatalogError] = useState<string | null>(null);
  const [pendingClassification, setPendingClassification] = useState<Record<number, string>>({});
  const [assignmentState, setAssignmentState] = useState<Record<number, AssignmentEntry>>({});
  const [removalState, setRemovalState] = useState<Record<string, RemovalEntry>>({});

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

  useEffect(() => {
    let canceled = false;

    setClassificationCatalogLoading(true);
    setClassificationCatalogError(null);

    fetchClassifications()
      .then((data) => {
        if (canceled) {
          return;
        }
        setClassificationCatalog(data);
      })
      .catch((err) => {
        if (canceled) {
          return;
        }
        setClassificationCatalogError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!canceled) {
          setClassificationCatalogLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [refreshIndex]);

  const handleRefresh = () => {
    setRefreshIndex((prev) => prev + 1);
  };

  const updateAssignmentStatus = (transcriptId: number, updates: Partial<AssignmentEntry>) => {
    setAssignmentState((prev) => {
      const current = prev[transcriptId] ?? { loading: false, error: null };
      return { ...prev, [transcriptId]: { ...current, ...updates } };
    });
  };

  const updateRemovalStatus = (key: string, updates: Partial<RemovalEntry>) => {
    setRemovalState((prev) => {
      const current = prev[key] ?? { loading: false, error: null };
      return { ...prev, [key]: { ...current, ...updates } };
    });
  };

  const getRemovalKey = (transcriptId: number, classificationId: string) =>
    `${transcriptId}:${classificationId}`;

  const handleAssignClassification = async (transcriptId: number) => {
    const classificationId = pendingClassification[transcriptId];
    if (!classificationId) {
      return;
    }

    updateAssignmentStatus(transcriptId, { loading: true, error: null });

    try {
      const assignments = await saveTranscriptClassification(transcriptId, classificationId);
      setTranscripts((records) =>
        records.map((record) =>
          record.id === transcriptId
            ? {
                ...record,
                classifications: assignments.map((assignment) => ({
                  id: assignment.classificationId,
                  name: assignment.name,
                  description: assignment.description
                }))
              }
            : record
        )
      );
      setPendingClassification((prev) => ({ ...prev, [transcriptId]: "" }));
    } catch (err) {
      updateAssignmentStatus(transcriptId, {
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      updateAssignmentStatus(transcriptId, { loading: false });
    }
  };

  const handleRemoveClassification = async (transcriptId: number, classificationId: string) => {
    const key = getRemovalKey(transcriptId, classificationId);
    updateRemovalStatus(key, { loading: true, error: null });

    try {
      await deleteTranscriptClassification(transcriptId, classificationId);
      setTranscripts((records) =>
        records.map((record) =>
          record.id === transcriptId
            ? {
                ...record,
                classifications: record.classifications.filter((entry) => entry.id !== classificationId)
              }
            : record
        )
      );
    } catch (err) {
      updateRemovalStatus(key, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      updateRemovalStatus(key, { loading: false });
    }
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

      {classificationCatalogError && (
        <div className="transcript-alert">
          <p className="text-base font-semibold text-rose-600">Unable to load classifications</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{classificationCatalogError}</p>
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
            {transcripts.map((record) => {
              const availableClassifications = classificationCatalog.filter(
                (catalogEntry) => !record.classifications.some((assigned) => assigned.id === catalogEntry.id)
              );
              const selectionValue = pendingClassification[record.id] ?? "";
              const assignmentEntry = assignmentState[record.id] ?? { loading: false, error: null };
              const isAssignDisabled =
                !selectionValue || assignmentEntry.loading || availableClassifications.length === 0;
              return (
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
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                        Classifications
                      </p>
                      <div>
                        {record.classifications.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {record.classifications.map((classification) => {
                              const removalKey = getRemovalKey(record.id, classification.id);
                              const removalEntry = removalState[removalKey];
                              return (
                                <span key={removalKey} className="metadata-badge flex items-center gap-2">
                                  <span>{classification.name || classification.id}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveClassification(record.id, classification.id)}
                                    disabled={removalEntry?.loading ?? false}
                                    className="text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-rose-500 hover:text-rose-700 focus:outline-none disabled:opacity-50"
                                  >
                                    {removalEntry?.loading ? "Removing…" : "Remove"}
                                  </button>
                                  {removalEntry?.error && (
                                    <span className="text-xs text-rose-600 block">{removalEntry.error}</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-400">No classifications assigned yet.</p>
                        )}
                      </div>
                      {classificationCatalogLoading ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Loading available labels…</p>
                      ) : classificationCatalog.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Create classifications from the classifications page to attach labels here.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            value={selectionValue}
                            onChange={(event) =>
                              setPendingClassification((prev) => ({
                                ...prev,
                                [record.id]: event.target.value
                              }))
                            }
                            disabled={assignmentEntry.loading || availableClassifications.length === 0}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            <option value="">Select a label</option>
                            {availableClassifications.map((classification) => (
                              <option key={classification.id} value={classification.id}>
                                {classification.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAssignClassification(record.id)}
                            disabled={isAssignDisabled}
                            className="rounded-full bg-slate-800 px-4 py-1 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-40"
                          >
                            {assignmentEntry.loading ? "Assigning…" : "Add label"}
                          </button>
                          {availableClassifications.length === 0 && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">All labels assigned.</p>
                          )}
                        </div>
                      )}
                      {assignmentState[record.id]?.error && (
                        <p className="text-xs text-rose-600">{assignmentState[record.id]?.error}</p>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
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

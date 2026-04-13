"use client";

import { RefreshCw, Loader2, AlertCircle, Trash2 } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  fetchClassifications,
  saveClassification,
  deleteClassification,
  type ClassificationRecord,
  type SaveClassificationInput
} from "../lib/classifications";
import { fetchUsage, type CodexUsage, type RateLimitWindow } from "../lib/usage";
import { deleteTranscriptClassification, saveTranscriptClassification } from "../lib/transcriptClassifications";
import {
  deleteAllTranscripts,
  deleteTranscript,
  fetchTranscripts,
  runTranscriptClassification,
  type TranscriptClassificationState,
  type TranscriptRecord
} from "../lib/transcripts";

const POLL_INTERVAL_MS = 30_000;

const formatTimestamp = (value: number | null) => {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const formatReceivedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return parsed.toLocaleString();
};

const renderWindow = (title: string, window?: RateLimitWindow) => {
  if (!window) {
    return (
      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/70 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">{title}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Not available</p>
      </div>
    );
  }

  const metrics = [
    ["Used", `${window.used_percent.toFixed(1)}%`],
    ["Window (s)", `${window.limit_window_seconds}`],
    ["Reset after (s)", `${window.reset_after_seconds}`],
    ["Reset at", new Date(window.reset_at * 1000).toLocaleTimeString()],
  ];

  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/70 p-4 space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">{title}</p>
      <dl className="grid gap-1 text-sm text-slate-600 dark:text-slate-300">
        {metrics.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <dt className="text-xs">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const SLUG_PREVIEW_INVALID_CHARS = /[^a-z0-9-]/g;
const SLUG_PREVIEW_SEQUENCE = /-+/g;
const SLUG_PREVIEW_TRIM = /^-+|-+$/g;

const classificationStateMeta: Record<TranscriptClassificationState, { label: string; classes: string }> = {
  pending: {
    label: "Pending classification",
    classes: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-500/10 dark:text-amber-200"
  },
  classified: {
    label: "Classified",
    classes: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200"
  },
  unclassified: {
    label: "Unclassified",
    classes: "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-200"
  }
};

const getSlugPreview = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(SLUG_PREVIEW_INVALID_CHARS, '-')
    .replace(SLUG_PREVIEW_SEQUENCE, '-')
    .replace(SLUG_PREVIEW_TRIM, '');

interface ClassificationFormState {
  id: string;
  name: string;
  description: string;
}

const DEFAULT_CLASSIFICATION_FORM: ClassificationFormState = {
  id: "",
  name: "",
  description: ""
};

type AssignmentEntry = { loading: boolean; error: string | null };
type RemovalEntry = { loading: boolean; error: string | null };
type ClassificationRequestEntry = { loading: boolean; error: string | null };

type SettingsView = "usage" | "classifications" | "transcripts";

const SETTINGS_VIEW_OPTIONS: { value: SettingsView; label: string }[] = [
  { value: "usage", label: "Usage monitoring" },
  { value: "classifications", label: "Classification metadata" },
  { value: "transcripts", label: "Transcript history" }
];

export default function SettingsPage() {
  const [usage, setUsage] = useState<CodexUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const isMountedRef = useRef(true);
  const transcriptAbortControllerRef = useRef<AbortController | null>(null);
  const [activeView, setActiveView] = useState<SettingsView>("usage");

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (transcriptAbortControllerRef.current) {
        transcriptAbortControllerRef.current.abort();
      }
    };
  }, []);

  const safeSetState = useCallback((updater: () => void) => {
    if (isMountedRef.current) {
      updater();
    }
  }, []);

  const [classificationRecords, setClassificationRecords] = useState<ClassificationRecord[]>([]);
  const [classificationError, setClassificationError] = useState<string | null>(null);
  const [classificationSuccessMessage, setClassificationSuccessMessage] = useState<string | null>(null);
  const [classificationLoading, setClassificationLoading] = useState(true);
  const [classificationRefreshing, setClassificationRefreshing] = useState(false);
  const [classificationSaving, setClassificationSaving] = useState(false);
  const [classificationDeletingId, setClassificationDeletingId] = useState<string | null>(null);
  const [classificationForm, setClassificationForm] = useState<ClassificationFormState>(() => ({
    ...DEFAULT_CLASSIFICATION_FORM
  }));
  const [isEditingClassification, setIsEditingClassification] = useState(false);
  const slugPreview = useMemo(() => getSlugPreview(classificationForm.name), [classificationForm.name]);

  // Transcript state
  const TRANSCRIPTS_PAGE_SIZE = 25;
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [transcriptsError, setTranscriptsError] = useState<string | null>(null);
  const [transcriptsDeleting, setTranscriptsDeleting] = useState(false);
  const [transcriptsDeleteError, setTranscriptsDeleteError] = useState<string | null>(null);
  const [transcriptsRefreshIndex, setTranscriptsRefreshIndex] = useState(0);
  const [transcriptsCurrentPage, setTranscriptsCurrentPage] = useState(1);
  const [transcriptsPaginationMeta, setTranscriptsPaginationMeta] = useState({
    total: 0,
    limit: TRANSCRIPTS_PAGE_SIZE,
    hasMore: false
  });
  const [pendingClassification, setPendingClassification] = useState<Record<number, string>>({});
  const [transcriptDeletionState, setTranscriptDeletionState] = useState<Record<number, { loading: boolean; error: string | null }>>({});
  const [classificationRequestState, setClassificationRequestState] = useState<Record<number, ClassificationRequestEntry>>({});
  const [assignmentState, setAssignmentState] = useState<Record<number, AssignmentEntry>>({});
  const [removalState, setRemovalState] = useState<Record<string, RemovalEntry>>({});
  const [transcriptFilter, setTranscriptFilter] = useState<'unclassified' | 'all'>('unclassified');
  const [unclassifiedTotal, setUnclassifiedTotal] = useState(0);
  const showUnclassifiedOnly = transcriptFilter === 'unclassified';

  const loadUsage = useCallback(
    async (options?: { showLoader?: boolean }) => {
      if (options?.showLoader) {
        safeSetState(() => {
          setLoading(true);
        });
      } else {
        safeSetState(() => {
          setRefreshing(true);
        });
      }

      try {
        const payload = await fetchUsage();
        safeSetState(() => {
          setUsage(payload);
          setError(null);
          setLastUpdatedAt(Date.now());
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        safeSetState(() => {
          setError(message);
        });
      } finally {
        if (options?.showLoader) {
          safeSetState(() => {
            setLoading(false);
          });
        } else {
          safeSetState(() => {
            setRefreshing(false);
          });
        }
      }
    },
    [safeSetState]
  );

  useEffect(() => {
    if (activeView !== "usage") {
      return;
    }

    // Only show full loader if we don't have usage data yet
    loadUsage({ showLoader: !usage });

    const interval = setInterval(() => {
      loadUsage();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [loadUsage, activeView, usage === null]);

  const loadClassifications = useCallback(
    async (options?: { showLoader?: boolean }) => {
      let success = true;
      if (options?.showLoader) {
        safeSetState(() => {
          setClassificationLoading(true);
        });
      } else {
        safeSetState(() => {
          setClassificationRefreshing(true);
        });
      }

      try {
        const payload = await fetchClassifications();
        safeSetState(() => {
          setClassificationRecords(payload);
          setClassificationError(null);
        });
      } catch (err) {
        success = false;
        const message = err instanceof Error ? err.message : String(err);
        safeSetState(() => {
          setClassificationError(message);
        });
      } finally {
        if (options?.showLoader) {
          safeSetState(() => {
            setClassificationLoading(false);
          });
        } else {
          safeSetState(() => {
            setClassificationRefreshing(false);
          });
        }
      }
      return success;
    },
    [safeSetState]
  );

  useEffect(() => {
    void loadClassifications({ showLoader: true });
  }, [loadClassifications]);

  const loadUnclassifiedBadgeCount = useCallback(async () => {
    try {
      const badgePayload = await fetchTranscripts({ classificationState: 'unclassified', limit: 1, page: 1 });
      safeSetState(() => {
        setUnclassifiedTotal(badgePayload.total);
      });
    } catch {
      // Ignore badge failures; the badge will refresh on the next manual action.
    }
  }, [safeSetState]);

  useEffect(() => {
    void loadUnclassifiedBadgeCount();
  }, [loadUnclassifiedBadgeCount]);

  const handleEditClassification = useCallback((record: ClassificationRecord) => {
    setClassificationForm({
      id: record.id,
      name: record.name,
      description: record.description ?? ""
    });
    setIsEditingClassification(true);
    setClassificationError(null);
    setClassificationSuccessMessage(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setClassificationForm({ ...DEFAULT_CLASSIFICATION_FORM });
    setIsEditingClassification(false);
    setClassificationError(null);
    setClassificationSuccessMessage(null);
  }, []);

  const handleClassificationSave = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedName = classificationForm.name.trim();

      if (!trimmedName) {
        safeSetState(() => {
          setClassificationError("Name is required");
          setClassificationSuccessMessage(null);
        });
        return;
      }

      safeSetState(() => {
        setClassificationSaving(true);
        setClassificationError(null);
        setClassificationSuccessMessage(null);
      });

      try {
        const payload: SaveClassificationInput = { name: trimmedName };
        const trimmedDescription = classificationForm.description.trim();
        if (trimmedDescription) {
          payload.description = trimmedDescription;
        }
        if (isEditingClassification) {
          payload.id = classificationForm.id.trim();
        }

        const savedRecord = await saveClassification(payload);

        safeSetState(() => {
          setClassificationForm({ ...DEFAULT_CLASSIFICATION_FORM });
          setIsEditingClassification(false);
        });

        const refreshed = await loadClassifications();

        if (refreshed) {
          safeSetState(() => {
            setClassificationSuccessMessage(`Classification saved (${savedRecord.id})`);
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        safeSetState(() => {
          setClassificationError(message);
        });
      } finally {
        safeSetState(() => {
          setClassificationSaving(false);
        });
      }
    },
    [classificationForm, isEditingClassification, loadClassifications, safeSetState]
  );

  const handleDeleteClassification = useCallback(
    async (id: string) => {
      safeSetState(() => {
        setClassificationDeletingId(id);
        setClassificationError(null);
        setClassificationSuccessMessage(null);
      });

      try {
        await deleteClassification(id);

        safeSetState(() => {
          if (isEditingClassification && classificationForm.id === id) {
            setIsEditingClassification(false);
            setClassificationForm({ ...DEFAULT_CLASSIFICATION_FORM });
          }
        });

        const refreshed = await loadClassifications();

        if (refreshed) {
          safeSetState(() => {
            setClassificationSuccessMessage("Classification deleted");
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        safeSetState(() => {
          setClassificationError(message);
        });
      } finally {
        safeSetState(() => {
          setClassificationDeletingId(null);
        });
      }
    },
    [classificationForm.id, isEditingClassification, loadClassifications, safeSetState]
  );

  const loadTranscripts = useCallback(
    async (options?: { showLoader?: boolean }) => {
      if (transcriptAbortControllerRef.current) {
        transcriptAbortControllerRef.current.abort();
      }
      transcriptAbortControllerRef.current = new AbortController();
      const signal = transcriptAbortControllerRef.current.signal;

      if (options?.showLoader) {
        safeSetState(() => {
          setTranscriptsLoading(true);
        });
      }
      safeSetState(() => {
        setTranscriptsError(null);
      });

      try {
        const data = await fetchTranscripts({
          limit: TRANSCRIPTS_PAGE_SIZE,
          page: transcriptsCurrentPage,
          classificationState: showUnclassifiedOnly ? 'unclassified' : 'all',
          signal
        });
        safeSetState(() => {
          setTranscripts(data.transcripts);
          setClassificationRequestState((prev) => {
            const next: Record<number, ClassificationRequestEntry> = {};
            data.transcripts.forEach((entry) => {
              if (prev[entry.id]) {
                next[entry.id] = prev[entry.id];
              }
            });
            return next;
          });
          setTranscriptsPaginationMeta({
            total: data.total,
            limit: data.limit,
            hasMore: data.hasMore
          });
          if (showUnclassifiedOnly) {
            setUnclassifiedTotal(data.total);
          }
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        safeSetState(() => {
          setTranscripts([]);
          setTranscriptsPaginationMeta({
            total: 0,
            limit: TRANSCRIPTS_PAGE_SIZE,
            hasMore: false
          });
          setClassificationRequestState({});
          setTranscriptsError(err instanceof Error ? err.message : String(err));
        });
      } finally {
        if (options?.showLoader) {
          safeSetState(() => {
            setTranscriptsLoading(false);
          });
        }
      }
    },
    [safeSetState, transcriptsCurrentPage, TRANSCRIPTS_PAGE_SIZE, transcriptFilter, showUnclassifiedOnly]
  );

  useEffect(() => {
    if (activeView === "transcripts") {
      void loadTranscripts({ showLoader: true });
    }
  }, [loadTranscripts, activeView, transcriptsRefreshIndex]);

  const handleTranscriptsRefresh = useCallback(() => {
    setTranscriptsRefreshIndex((prev) => prev + 1);
    void loadUnclassifiedBadgeCount();
  }, [loadUnclassifiedBadgeCount]);

  const handleTranscriptFilterToggle = useCallback(() => {
    setTranscriptsCurrentPage(1);
    setTranscriptFilter((prev) => (prev === 'unclassified' ? 'all' : 'unclassified'));
    void loadUnclassifiedBadgeCount();
  }, [loadUnclassifiedBadgeCount]);

  const updateAssignmentStatus = useCallback((transcriptId: number, updates: Partial<AssignmentEntry>) => {
    setAssignmentState((prev) => {
      const current = prev[transcriptId] ?? { loading: false, error: null };
      return { ...prev, [transcriptId]: { ...current, ...updates } };
    });
  }, []);

  const updateRemovalStatus = useCallback((key: string, updates: Partial<RemovalEntry>) => {
    setRemovalState((prev) => {
      const current = prev[key] ?? { loading: false, error: null };
      return { ...prev, [key]: { ...current, ...updates } };
    });
  }, []);

  const updateClassificationRequestState = useCallback((transcriptId: number, updates: Partial<ClassificationRequestEntry>) => {
    setClassificationRequestState((prev) => {
      const current = prev[transcriptId] ?? { loading: false, error: null };
      return { ...prev, [transcriptId]: { ...current, ...updates } };
    });
  }, []);

  const getRemovalKey = useCallback((transcriptId: number, classificationId: string) =>
    `${transcriptId}:${classificationId}`, []);

  const handleAssignClassification = useCallback(async (transcriptId: number) => {
    const classificationId = pendingClassification[transcriptId];
    if (!classificationId) {
      return;
    }

    updateAssignmentStatus(transcriptId, { loading: true, error: null });

    try {
      const assignments = await saveTranscriptClassification(transcriptId, classificationId);
      safeSetState(() => {
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
      });
    } catch (err) {
      updateAssignmentStatus(transcriptId, {
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      updateAssignmentStatus(transcriptId, { loading: false });
    }
  }, [pendingClassification, updateAssignmentStatus, safeSetState]);

  const handleRemoveClassification = useCallback(async (transcriptId: number, classificationId: string) => {
    const key = getRemovalKey(transcriptId, classificationId);
    updateRemovalStatus(key, { loading: true, error: null });

    try {
      await deleteTranscriptClassification(transcriptId, classificationId);
      safeSetState(() => {
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
      });
    } catch (err) {
      updateRemovalStatus(key, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      updateRemovalStatus(key, { loading: false });
    }
  }, [getRemovalKey, updateRemovalStatus, safeSetState]);

  const handleTranscriptClassificationRequest = useCallback(
    async (record: TranscriptRecord) => {
      if (record.classificationState === 'classified') {
        return;
      }
      const requestEntry = classificationRequestState[record.id];
      if (requestEntry?.loading) {
        return;
      }

      safeSetState(() => {
        updateClassificationRequestState(record.id, { loading: true, error: null });
      });

      try {
        await runTranscriptClassification(record.id);
        await loadTranscripts();
        safeSetState(() => {
          updateClassificationRequestState(record.id, { loading: false, error: null });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        safeSetState(() => {
          updateClassificationRequestState(record.id, { loading: false, error: message });
        });
      }
    },
    [classificationRequestState, loadTranscripts, safeSetState, updateClassificationRequestState]
  );

  const handleTranscriptsDeleteAll = useCallback(async () => {
    if (transcriptsDeleting) {
      return;
    }

    const confirmed = window.confirm(
      "Delete all transcripts? This permanently removes every row from the global history."
    );
    if (!confirmed) {
      return;
    }

    setTranscriptsDeleting(true);
    setTranscriptsDeleteError(null);

    try {
      await deleteAllTranscripts();
      safeSetState(() => {
        setTranscriptsCurrentPage(1);
        setTranscriptsRefreshIndex((prev) => prev + 1);
      });
      void loadUnclassifiedBadgeCount();
    } catch (err) {
      setTranscriptsDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranscriptsDeleting(false);
    }
  }, [transcriptsDeleting, safeSetState, loadUnclassifiedBadgeCount]);

  const handleDeleteTranscript = useCallback(async (id: number) => {
    const confirmed = window.confirm("Delete this transcript? This action cannot be undone.");
    if (!confirmed) return;

    setTranscriptDeletionState((prev) => ({ ...prev, [id]: { loading: true, error: null } }));

    try {
      await deleteTranscript(id);
      safeSetState(() => {
        setTranscripts((prev) => prev.filter((t) => t.id !== id));
        setTranscriptsPaginationMeta((prev) => {
          const newTotal = Math.max(0, prev.total - 1);
          return {
            ...prev,
            total: newTotal,
            hasMore: transcriptsCurrentPage * prev.limit < newTotal
          };
        });
      });
      void loadUnclassifiedBadgeCount();
    } catch (err) {
      setTranscriptDeletionState((prev) => ({
        ...prev,
        [id]: { loading: false, error: err instanceof Error ? err.message : String(err) }
      }));
    } finally {
      setTranscriptDeletionState((prev) => {
        const newState = { ...prev };
        if (newState[id] && !newState[id].error) {
          delete newState[id];
        }
        return newState;
      });
    }
  }, [safeSetState, loadUnclassifiedBadgeCount, transcriptsCurrentPage]);

  const handleTranscriptsPreviousPage = useCallback(() => {
    setTranscriptsCurrentPage((page) => Math.max(1, page - 1));
  }, []);

  const handleTranscriptsNextPage = useCallback(() => {
    if (!transcriptsPaginationMeta.hasMore) {
      return;
    }
    setTranscriptsCurrentPage((page) => page + 1);
  }, [transcriptsPaginationMeta.hasMore]);

  const rateLimit = usage?.rate_limit;
  const credits = usage?.credits;
  const spendControl = usage?.spend_control;

  const approxLocal = credits?.approx_local_messages?.length
    ? credits.approx_local_messages.join(", ")
    : "n/a";
  const approxCloud = credits?.approx_cloud_messages?.length
    ? credits.approx_cloud_messages.join(", ")
    : "n/a";

  const summaryPairs = useMemo(() => {
    if (!usage) {
      return [];
    }

    return [
      ["Plan", usage.plan_type],
      ["Has credits", usage.credits.has_credits ? "yes" : "no"],
      ["Unlimited credits", usage.credits.unlimited ? "yes" : "no"],
      ["Overage capped", usage.credits.overage_limit_reached ? "yes" : "no"],
    ];
  }, [usage]);

  const renderJson = () => {
    if (!usage) {
      return "Waiting for data…";
    }
    return JSON.stringify(usage, null, 2);
  };

  const isUsageView = activeView === "usage";
  const isClassificationsView = activeView === "classifications";
  const isTranscriptsView = activeView === "transcripts";

  const transcriptLimitForSummary = Math.max(1, transcriptsPaginationMeta.limit || TRANSCRIPTS_PAGE_SIZE);
  const transcriptTotalEntries = transcriptsPaginationMeta.total;
  const transcriptTotalPages = transcriptTotalEntries > 0 ? Math.max(1, Math.ceil(transcriptTotalEntries / transcriptLimitForSummary)) : 1;
  const transcriptStartEntry = transcriptTotalEntries === 0 ? 0 : (transcriptsCurrentPage - 1) * transcriptLimitForSummary + 1;
  const transcriptEndEntry = transcriptTotalEntries === 0 ? 0 : Math.min(transcriptTotalEntries, transcriptsCurrentPage * transcriptLimitForSummary);
  const isTranscriptsPreviousDisabled = transcriptsCurrentPage <= 1 || transcriptsLoading || transcriptsDeleting;
  const isTranscriptsNextDisabled = !transcriptsPaginationMeta.hasMore || transcriptsLoading || transcriptsDeleting;

  const contextMenuDescription =
    "Choose whether you want to monitor usage, edit classification metadata, or browse transcript history.";

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4 text-center md:space-y-6 mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Settings</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300">
          Switch between usage monitoring, classification metadata, and transcript history without leaving this view.
        </p>
        <div
          className="flex flex-wrap items-center justify-center gap-3"
          role="tablist"
          aria-label="Settings views"
        >
          {SETTINGS_VIEW_OPTIONS.map((option) => {
            const isSelected = activeView === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${option.value}-panel`}
                onClick={() => setActiveView(option.value)}
                className={`flex-1 min-w-[180px] rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${isSelected
                    ? "border-transparent bg-slate-900 text-white shadow-lg dark:bg-slate-200 dark:text-slate-900"
                    : "border-slate-200/70 bg-white/90 text-slate-700 hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
                  }`}
              >
                {option.value === "transcripts" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span>{option.label}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/70 bg-rose-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-rose-700 dark:border-rose-600/60 dark:bg-rose-500/10 dark:text-rose-200">
                      <AlertCircle className="w-3 h-3" />
                      <span>{unclassifiedTotal}</span>
                    </span>
                  </span>
                ) : (
                  option.label
                )}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{contextMenuDescription}</p>
      </section>

      {isUsageView && (
        <section
          id="usage-panel"
          className="rounded-3xl border border-slate-200/70 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/70 shadow-xl p-6 space-y-6"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1 max-w-2xl text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Usage</p>
              <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">Usage monitoring</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Polls the Codex usage endpoint every 30 seconds so you can keep usage metrics and rate limits up to
                date.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => loadUsage()}
                disabled={refreshing}
                className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Polling now…
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Poll immediately
                  </>
                )}
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Last update: {formatTimestamp(lastUpdatedAt)} (every 30 s)
              </p>
            </div>
          </div>

          {(error || loading) && (
            <div className="transcript-alert">
              {error ? (
                <>
                  <p className="text-base font-semibold text-rose-600">Unable to load usage metrics</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Fetching usage metrics…</p>
                </div>
              )}
            </div>
          )}

          {!loading && usage && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Usage summary</p>
                  {summaryPairs.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200"
                    >
                      <span>{label}</span>
                      <span className="font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Credits</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">Balance: {credits?.balance ?? "—"}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">Approx local messages: {approxLocal}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">Approx cloud messages: {approxCloud}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    Spend control reached: {spendControl?.reached ? "yes" : "no"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {renderWindow("Primary window", rateLimit?.primary_window)}
                {renderWindow("Secondary window", rateLimit?.secondary_window)}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Raw payload</p>
                <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/60 bg-slate-100/80 dark:bg-slate-950/60 p-4">
                  <pre className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                    {renderJson()}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {isClassificationsView && (
        <section
          id="classifications-panel"
          className="rounded-3xl border border-slate-200/70 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/70 shadow-xl p-6 space-y-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Classifications</p>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Manage classification metadata</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Add, edit, or remove classification records that define how usage data is grouped.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadClassifications()}
              disabled={classificationRefreshing}
              className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {classificationRefreshing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Refreshing…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Refresh list
                </>
              )}
            </button>
          </div>

          {classificationSuccessMessage && (
            <div className="transcript-alert border-emerald-200 bg-emerald-50 text-emerald-700">
              <p className="text-sm font-semibold">{classificationSuccessMessage}</p>
            </div>
          )}

          {classificationError && (
            <div className="transcript-alert">
              <p className="text-base font-semibold text-rose-600">Unable to update classifications</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{classificationError}</p>
            </div>
          )}

          {classificationLoading ? (
            <div className="transcript-alert">
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Fetching classifications…</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1.5fr,1fr,2fr,auto] gap-3 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-500 md:grid">
                <span>ID</span>
                <span>Name</span>
                <span>Description</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-950/40">
                {classificationRecords.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No classifications saved yet.</div>
                ) : (
                  classificationRecords.map((record) => (
                    <div
                      key={record.id}
                      className="grid items-center gap-3 border-t border-slate-200/70 px-4 py-3 last:border-b dark:border-slate-800/60 md:grid-cols-[1.5fr,1fr,2fr,auto]"
                    >
                      <span className="font-mono text-sm text-slate-700 dark:text-slate-200">{record.id}</span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{record.name}</span>
                      <span className="text-sm text-slate-600 dark:text-slate-300">{record.description ?? "—"}</span>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditClassification(record)}
                          className="rounded-full border border-slate-200/70 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700/60 dark:text-slate-200"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClassification(record.id)}
                          disabled={classificationDeletingId === record.id}
                          className="flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300"
                        >
                          {classificationDeletingId === record.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Deleting…
                            </>
                          ) : (
                            "Delete"
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleClassificationSave}>
            <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <p>IDs are generated automatically from the name.</p>
              <p className="font-mono text-slate-700 dark:text-slate-200">
                Preview: {slugPreview || "—"}
              </p>
              {isEditingClassification && classificationForm.id && (
                <p>
                  Editing preserves identifier{' '}
                  <span className="font-mono text-slate-900 dark:text-white">{classificationForm.id}</span>
                  .
                </p>
              )}
            </div>
            <label className="space-y-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <span>Name</span>
              <input
                type="text"
                value={classificationForm.name}
                onChange={(event) =>
                  setClassificationForm((prev) => ({ ...prev, name: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <span>Description</span>
              <textarea
                rows={3}
                value={classificationForm.description}
                onChange={(event) =>
                  setClassificationForm((prev) => ({ ...prev, description: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={classificationSaving}
                className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {classificationSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save classification"
                )}
              </button>
              {isEditingClassification && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-full border border-slate-200/70 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-800/60 dark:text-slate-200"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {isTranscriptsView && (
        <section
          id="transcripts-panel"
          className="rounded-3xl border border-slate-200/70 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/70 shadow-xl p-6 space-y-6"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1 max-w-2xl text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Transcripts</p>
              <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">Global transcript history</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Browse every transcript row Aura has persisted, sorted by newest entries first.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTranscriptFilterToggle}
                disabled={transcriptsLoading || transcriptsDeleting}
                aria-pressed={showUnclassifiedOnly}
                className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AlertCircle
                  className={`w-4 h-4 ${showUnclassifiedOnly ? 'text-rose-500' : 'text-slate-500'}`}
                />
                {showUnclassifiedOnly ? 'Show all transcripts' : 'Show unclassified only'}
              </button>
              <button
                type="button"
                onClick={handleTranscriptsRefresh}
                disabled={transcriptsLoading || transcriptsDeleting}
                className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${transcriptsLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleTranscriptsDeleteAll}
                disabled={transcriptsLoading || transcriptsDeleting}
                className="flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-600/50 dark:bg-rose-500/10 dark:text-rose-300"
              >
                {transcriptsDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete all transcripts"
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {showUnclassifiedOnly
                ? 'Showing unclassified transcripts only.'
                : 'Showing every transcript entry.'}
            </p>
          </div>

          {(transcriptsError || transcriptsDeleteError || classificationError) && (
            <div className="transcript-alert">
              {transcriptsError && (
                <>
                  <p className="text-base font-semibold text-rose-600">Unable to load transcripts</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{transcriptsError}</p>
                </>
              )}
              {transcriptsDeleteError && (
                <>
                  <p className="text-base font-semibold text-rose-600">Unable to delete transcripts</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{transcriptsDeleteError}</p>
                </>
              )}
              {classificationError && (
                <>
                  <p className="text-base font-semibold text-rose-600">Unable to load classifications</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{classificationError}</p>
                </>
              )}
            </div>
          )}

          {transcriptsLoading ? (
            <div className="transcript-alert">
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Fetching transcripts…</p>
              </div>
            </div>
          ) : transcripts.length === 0 && !transcriptsError ? (
            <div className="transcript-alert">
              <p className="text-base font-semibold">
                {showUnclassifiedOnly ? "No unclassified transcripts" : "No transcripts yet"}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {showUnclassifiedOnly
                  ? 'Every transcript in your history has already been classified. Toggle "Show all transcripts" to browse every saved entry.'
                  : 'Aura has not persisted any transcripts yet. Wake the assistant or refresh in a moment to see newly recorded snippets.'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <ul className="space-y-4">
                {transcripts.map((record) => {
                  const availableClassifications = classificationRecords.filter(
                    (catalogEntry) => !record.classifications.some((assigned) => assigned.id === catalogEntry.id)
                  );
                  const selectionValue = pendingClassification[record.id] ?? "";
                  const assignmentEntry = assignmentState[record.id] ?? { loading: false, error: null };
                  const isAssignDisabled =
                    !selectionValue || assignmentEntry.loading || availableClassifications.length === 0;
                  const classificationRequestEntry =
                    classificationRequestState[record.id] ?? { loading: false, error: null };
                  const classificationStateInfo = classificationStateMeta[record.classificationState];
                  const isClassificationRequestDisabled =
                    record.classificationState === "classified" || classificationRequestEntry.loading;
                  return (
                    <li key={`${record.sessionId}-${record.receivedAt}-${record.payload}`}>
                      <article className="rounded-2xl border border-slate-200/70 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/20 p-5 space-y-4">
                        <header className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {formatReceivedAt(record.receivedAt)}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDeleteTranscript(record.id)}
                                disabled={transcriptDeletionState[record.id]?.loading}
                                className="p-1 rounded-full text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                                title="Delete transcript"
                              >
                                {transcriptDeletionState[record.id]?.loading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                              {transcriptDeletionState[record.id]?.error && (
                                <span className="text-rose-600 shrink-0" title={transcriptDeletionState[record.id].error ?? undefined}>
                                  <AlertCircle className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {record.sessionId}
                          </span>
                        </header>
                        <p className="text-base leading-relaxed text-slate-900 dark:text-slate-100">{record.payload}</p>
                        {record.metadata && (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(record.metadata).map(([key, value]) => (
                              <span key={key} className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700/60">
                                {key}: {typeof value === "string" ? value : JSON.stringify(value)}
                              </span>
                            ))}
                          </div>
                        )}
                      <div className="pt-2 space-y-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                              Classifications
                            </p>
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.28em] ${classificationStateInfo.classes}`}
                              >
                                {classificationStateInfo.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleTranscriptClassificationRequest(record)}
                                disabled={isClassificationRequestDisabled}
                                title={record.classificationState === 'classified' ? 'Transcript already classified' : 'Update classification'}
                                className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {classificationRequestEntry.loading ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Updating…
                                  </>
                                ) : (
                                  "Update classification"
                                )}
                              </button>
                            </div>
                          </div>
                          {classificationRequestEntry.error && (
                            <p className="text-xs text-rose-600" role="status" aria-live="polite">
                              {classificationRequestEntry.error}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {record.classifications.length > 0 ? (
                            record.classifications.map((classification) => {
                              const removalKey = getRemovalKey(record.id, classification.id);
                              const removalEntry = removalState[removalKey];
                                return (
                                  <span key={removalKey} className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800/50">
                                    <span>{classification.name || classification.id}</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveClassification(record.id, classification.id)}
                                        disabled={removalEntry?.loading ?? false}
                                        className="text-[0.65rem] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-700 focus:outline-none disabled:opacity-50"
                                      >
                                        {removalEntry?.loading ? "…" : "Remove"}
                                      </button>
                                      {removalEntry?.error && (
                                        <span className="text-rose-600 shrink-0" title={removalEntry.error ?? undefined}>
                                          <AlertCircle className="w-3 h-3" />
                                        </span>
                                      )}
                                    </div>
                                  </span>
                                );
                              })
                            ) : (
                              <p className="text-xs text-slate-500 dark:text-slate-400 italic">No classifications assigned yet.</p>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2 items-center">
                            {classificationLoading ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">Loading available labels…</p>
                            ) : classificationRecords.length === 0 ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                No labels defined. Create classifications in the metadata tab to attach labels here.
                              </p>
                            ) : (
                              <>
                                <select
                                  value={selectionValue}
                                  onChange={(event) =>
                                    setPendingClassification((prev) => ({
                                      ...prev,
                                      [record.id]: event.target.value
                                    }))
                                  }
                                  disabled={assignmentEntry.loading || availableClassifications.length === 0}
                                  className="rounded-full border border-slate-200/70 bg-white/90 px-3 py-1 text-xs text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:opacity-60"
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
                                  className="rounded-full bg-slate-800 px-4 py-1 text-xs font-semibold text-white hover:bg-slate-900 transition disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                                >
                                  {assignmentEntry.loading ? "Assigning…" : "Add label"}
                                </button>
                                {availableClassifications.length === 0 && record.classifications.length > 0 && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">All available labels assigned.</p>
                                )}
                              </>
                            )}
                          </div>
                          {assignmentEntry.error && (
                            <p className="text-xs text-rose-600">{assignmentEntry.error}</p>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200/70 dark:border-slate-800/60">
                <div className="space-y-1 text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                    Page {transcriptsCurrentPage} of {transcriptTotalPages}
                  </p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Showing entries {transcriptStartEntry}–{transcriptEndEntry} of {transcriptTotalEntries}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTranscriptsPreviousPage}
                    disabled={isTranscriptsPreviousDisabled}
                    className="rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={handleTranscriptsRefresh}
                    disabled={transcriptsLoading || transcriptsDeleting}
                    className="rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleTranscriptsNextPage}
                    disabled={isTranscriptsNextDisabled}
                    className="rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

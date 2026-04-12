"use client";

import { RefreshCw, Loader2 } from "lucide-react";
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
  type ClassificationRecord
} from "../lib/classifications";
import { fetchUsage, type CodexUsage, type RateLimitWindow } from "../lib/usage";

const POLL_INTERVAL_MS = 30_000;

const formatTimestamp = (value: number | null) => {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

type SettingsView = "usage" | "classifications";

const SETTINGS_VIEW_OPTIONS: { value: SettingsView; label: string }[] = [
  { value: "usage", label: "Usage monitoring" },
  { value: "classifications", label: "Classification metadata" }
];

export default function SettingsPage() {
  const [usage, setUsage] = useState<CodexUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const isMountedRef = useRef(true);
  const [activeView, setActiveView] = useState<SettingsView>("usage");

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
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
      const trimmedId = classificationForm.id.trim();
      const trimmedName = classificationForm.name.trim();

      if (!trimmedId || !trimmedName) {
        safeSetState(() => {
          setClassificationError("ID and name are required");
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
        await saveClassification({
          id: trimmedId,
          name: trimmedName,
          description: classificationForm.description.trim() || undefined
        });

        safeSetState(() => {
          setClassificationForm({ ...DEFAULT_CLASSIFICATION_FORM });
          setIsEditingClassification(false);
        });

        const refreshed = await loadClassifications();

        if (refreshed) {
          safeSetState(() => {
            setClassificationSuccessMessage("Classification saved");
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
    [classificationForm, loadClassifications, safeSetState]
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
  const contextMenuDescription =
    "Choose whether you want to monitor usage or edit classification metadata.";

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4 text-center md:space-y-6 mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Settings</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300">
          Switch between usage monitoring and classification metadata without leaving this view.
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
                className={`flex-1 min-w-[180px] rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${
                  isSelected
                    ? "border-transparent bg-slate-900 text-white shadow-lg dark:bg-slate-200 dark:text-slate-900"
                    : "border-slate-200/70 bg-white/90 text-slate-700 hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
                }`}
              >
                {option.label}
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
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                <span>Identifier</span>
                <input
                  type="text"
                  value={classificationForm.id}
                  onChange={(event) =>
                    setClassificationForm((prev) => ({ ...prev, id: event.target.value }))
                  }
                  disabled={isEditingClassification}
                  className="w-full rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
                />
              </label>
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
            </div>
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
    </div>
  );
}

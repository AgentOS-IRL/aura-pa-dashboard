"use client";

import { RefreshCw, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export default function DebugPage() {
  const [usage, setUsage] = useState<CodexUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const isMountedRef = useRef(true);

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
    loadUsage({ showLoader: true });

    const interval = setInterval(() => {
      loadUsage();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [loadUsage]);

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

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4 text-center md:space-y-6 mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Debug</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white">
          OpenAI usage watcher
        </h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300">
          Polls the Codex usage endpoint every 30 seconds so you can keep an eye on rate limits and credits.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
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
      </section>

      {(error || loading) && (
        <div className="transcript-alert">
          {error ? (
            <>
              <p className="text-base font-semibold text-rose-600">Unable to load OpenAI usage</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Fetching usage…</p>
            </div>
          )}
        </div>
      )}

      {!loading && usage && (
        <section className="rounded-3xl border border-slate-200/70 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/70 shadow-xl p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Usage summary</p>
              {summaryPairs.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
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
        </section>
      )}
    </div>
  );
}

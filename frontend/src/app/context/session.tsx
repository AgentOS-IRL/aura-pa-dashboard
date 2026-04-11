"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const SESSION_STORAGE_KEY = "aura-pa-session-id";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredSessionId(storage?: Storage | null): string | null {
  const target = storage ?? (storage === undefined ? getStorage() : null);
  if (!target) {
    return null;
  }

  try {
    return target.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistSessionId(sessionId: string | null, storage?: Storage | null): void {
  const target = storage ?? (storage === undefined ? getStorage() : null);
  if (!target) {
    return;
  }

  if (sessionId) {
    try {
      target.setItem(SESSION_STORAGE_KEY, sessionId);
    } catch {
      // ignore storage errors
    }
  } else {
    try {
      target.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
}

export interface SessionContextValue {
  sessionId: string | null;
  setSessionId: (value: string | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionIdState] = useState<string | null>(() => null);

  useEffect(() => {
    const stored = readStoredSessionId();
    if (stored) {
      setSessionIdState(stored);
    }
  }, []);

  const setSessionId = useCallback((value: string | null) => {
    setSessionIdState(value);
    persistSessionId(value);
  }, []);

  return (
    <SessionContext.Provider value={{ sessionId, setSessionId }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("SessionProvider is missing");
  }
  return context;
}

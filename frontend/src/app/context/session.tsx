"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const SESSION_STORAGE_KEY = "aura-pa-session-id";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readStoredSessionId(storage?: Storage | null): string | null {
  const target = storage ?? (storage === undefined ? getStorage() : null);
  if (!target) {
    return null;
  }

  return target.getItem(SESSION_STORAGE_KEY);
}

export function persistSessionId(sessionId: string | null, storage?: Storage | null): void {
  const target = storage ?? (storage === undefined ? getStorage() : null);
  if (!target) {
    return;
  }

  if (sessionId) {
    target.setItem(SESSION_STORAGE_KEY, sessionId);
  } else {
    target.removeItem(SESSION_STORAGE_KEY);
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

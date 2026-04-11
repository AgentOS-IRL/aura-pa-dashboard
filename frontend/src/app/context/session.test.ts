import { describe, expect, it } from "vitest";
import { persistSessionId, readStoredSessionId } from "./session";

function createFakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    key(_index: number) {
      return null;
    },
    get length() {
      return data.size;
    },
    __data: data,
  } as Storage & { __data: Map<string, string> };
}

describe("session persistence helpers", () => {
  it("reads and writes session IDs", () => {
    const storage = createFakeStorage();
    persistSessionId("session-42", storage);

    expect(storage.getItem("aura-pa-session-id")).toBe("session-42");
    expect(readStoredSessionId(storage)).toBe("session-42");
  });

  it("clears the stored session when null is provided", () => {
    const storage = createFakeStorage();
    storage.setItem("aura-pa-session-id", "legacy");

    persistSessionId(null, storage);

    expect(storage.getItem("aura-pa-session-id")).toBeNull();
    expect(readStoredSessionId(storage)).toBeNull();
  });

  it("returns null when storage is unavailable", () => {
    expect(readStoredSessionId(null)).toBeNull();
    expect(() => persistSessionId("session", null)).not.toThrow();
  });

  it("handles storage errors without throwing", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as Storage;

    expect(readStoredSessionId(storage)).toBeNull();
    expect(() => persistSessionId("session", storage)).not.toThrow();
    expect(() => persistSessionId(null, storage)).not.toThrow();
  });

  it("ignores restricted window.localStorage access", () => {
    const globalWindow = globalThis as typeof globalThis & { window?: Window };
    const originalWindow = globalWindow.window;
    const stubWindow = {} as Window;

    Object.defineProperty(stubWindow, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });

    globalWindow.window = stubWindow;

    try {
      expect(readStoredSessionId()).toBeNull();
      expect(() => persistSessionId("session")).not.toThrow();
      expect(() => persistSessionId(null)).not.toThrow();
    } finally {
      globalWindow.window = originalWindow;
    }
  });
});

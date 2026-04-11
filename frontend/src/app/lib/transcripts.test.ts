import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTranscripts } from "./transcripts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("fetchTranscripts", () => {
  it("fetches transcripts for the provided session", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ transcripts: [] }),
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await fetchTranscripts("session-123");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/sessions/session-123/transcript", {
      method: "GET",
    });
  });

  it("includes the limit parameter when provided", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ transcripts: [] }),
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await fetchTranscripts("session-xyz", 5);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/sessions/session-xyz/transcript?limit=5", {
      method: "GET",
    });
  });

  it("throws when the backend returns an error", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Boom",
        text: () => Promise.resolve("something went wrong"),
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTranscripts("session-1")).rejects.toThrow("Failed to fetch transcripts (500)");
  });

  it("throws when no session id is provided", async () => {
    await expect(fetchTranscripts("")).rejects.toThrow("Session ID is required");
  });
});

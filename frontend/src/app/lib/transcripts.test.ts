import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAllTranscripts, fetchTranscripts } from "./transcripts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("fetchTranscripts", () => {
  it("fetches transcripts and returns pagination metadata", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          transcripts: [],
          page: 1,
          limit: 25,
          total: 0,
          hasMore: false
        })
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTranscripts();

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/transcripts", {
      method: "GET",
      signal: undefined
    });
    expect(result).toEqual({
      transcripts: [],
      page: 1,
      limit: 25,
      total: 0,
      hasMore: false
    });
  });

  it("includes the limit and page parameters when provided", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          transcripts: [],
          page: 2,
          limit: 5,
          total: 0,
          hasMore: false
        })
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pageInfo = await fetchTranscripts({ limit: 5, page: 2 });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/transcripts?limit=5&page=2", {
      method: "GET",
      signal: undefined
    });
    expect(pageInfo.page).toBe(2);
    expect(pageInfo.limit).toBe(5);
  });

  it("normalizes transcript records and attached classifications", async () => {
    const transcriptRow = {
      id: 42,
      sessionId: "session-1",
      payload: "hello aura",
      metadata: { speaker: "user" },
      receivedAt: "2026-04-01T12:00:00Z",
      classificationState: "classified",
      classificationReason: "  note  ",
      classifications: [
        { id: "cat-1", name: "First", description: "desc" }
      ]
    };

    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          transcripts: [transcriptRow],
          page: 1,
          limit: 25,
          total: 1,
          hasMore: false
        })
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTranscripts();

    expect(result.transcripts).toEqual([
      {
        id: 42,
        sessionId: "session-1",
        payload: "hello aura",
        metadata: { speaker: "user" },
        receivedAt: "2026-04-01T12:00:00Z",
        classificationState: "classified",
        classificationReason: "note",
        classifications: [
          { id: "cat-1", name: "First", description: "desc" }
        ]
      }
    ]);
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

    await expect(fetchTranscripts()).rejects.toThrow("Failed to fetch transcripts (500)");
  });
});

describe("deleteAllTranscripts", () => {
  it("deletes the transcripts via the backend", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteAllTranscripts()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/transcripts", {
      method: "DELETE",
    });
  });

  it("throws when the delete call fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Bad delete",
        text: () => Promise.resolve("cleanup failed"),
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteAllTranscripts()).rejects.toThrow("Failed to delete transcripts (500)");
  });
});

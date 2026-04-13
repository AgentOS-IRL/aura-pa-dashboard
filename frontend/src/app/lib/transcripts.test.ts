import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAllTranscripts, fetchTranscripts, runTranscriptClassification } from "./transcripts";

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

  it("includes the classificationState query when provided", async () => {
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
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await fetchTranscripts({ classificationState: "unclassified", limit: 5 });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/transcripts?limit=5&classificationState=unclassified", {
      method: "GET",
      signal: undefined
    });
  });

  it("omits classificationState when set to 'all'", async () => {
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
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await fetchTranscripts({ classificationState: "all" });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/transcripts", {
      method: "GET",
      signal: undefined
    });
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

describe("runTranscriptClassification", () => {
  it("posts to the backend and resolves on success", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 204
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(runTranscriptClassification(12)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/transcripts/12/classify", {
      method: "POST"
    });
  });

  it("throws when the classification endpoint fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Bad classification",
        text: () => Promise.resolve("worker error")
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(runTranscriptClassification(7)).rejects.toThrow(
      "Failed to run classification for transcript 7 (500): worker error"
    );
  });
});

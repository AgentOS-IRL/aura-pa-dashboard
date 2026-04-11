import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTranscripts } from "./transcripts";

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

    const result = await fetchTranscripts("session-123");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/sessions/session-123/transcript", {
      method: "GET",
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

    const pageInfo = await fetchTranscripts("session-xyz", { limit: 5, page: 2 });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/sessions/session-xyz/transcript?limit=5&page=2", {
      method: "GET",
    });
    expect(pageInfo.page).toBe(2);
    expect(pageInfo.limit).toBe(5);
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

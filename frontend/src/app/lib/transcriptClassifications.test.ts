import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchTranscriptClassifications,
  saveTranscriptClassification,
  deleteTranscriptClassification
} from "./transcriptClassifications";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("transcript classifications helper", () => {
  it("fetches transcript classifications", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ transcriptId: 1, classificationId: "cat-1", name: "First", description: null, assignedAt: "2026-04-01T12:00:00Z" }])
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const assignments = await fetchTranscriptClassifications(1);

    expect(fetchMock).toHaveBeenCalled();
    expect(assignments).toHaveLength(1);
    expect(assignments[0].classificationId).toBe("cat-1");
  });

  it("saves a classification and returns the updated list", async () => {
    const response = [{ transcriptId: 2, classificationId: "cat-2", name: "Second", description: "desc", assignedAt: "2026-04-02T12:00:00Z" }];
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response)
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await saveTranscriptClassification(2, "cat-2");

    expect(fetchMock).toHaveBeenCalled();
    expect(result).toEqual(response);
  });

  it("deletes a transcript classification", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteTranscriptClassification(3, "cat-3")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("throws when saving fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        statusText: "Bad",
        text: () => Promise.resolve("invalid")
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(saveTranscriptClassification(1, "cat"))
      .rejects.toThrow("Failed to save transcript classification (400: invalid)");
  });

  it("throws when deletion fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Boom",
        text: () => Promise.resolve("oops")
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteTranscriptClassification(1, "cat"))
      .rejects.toThrow("Failed to delete transcript classification (500: oops)");
  });
});

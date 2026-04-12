import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteClassification, fetchClassifications, saveClassification } from "./classifications";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("fetchClassifications", () => {
  it("fetches the list of classifications", async () => {
    const records = [
      { id: "cat-1", name: "First", description: "desc" }
    ];
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(records)
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchClassifications();

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/classifications", {
      method: "GET"
    });
    expect(result).toEqual(records);
  });

  it("throws when the backend responds with an error", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Boom",
        text: () => Promise.resolve("unable to list")
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchClassifications()).rejects.toThrow("Failed to fetch classifications (500: unable to list)");
  });
});

describe("saveClassification", () => {
  it("sends payload to backend and returns saved record", async () => {
    const payload = { id: "cat-1", name: "Name", description: "desc" };
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload)
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await saveClassification(payload);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/classifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(result).toEqual(payload);
  });

  it("throws when saving fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: () => Promise.resolve("missing fields")
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(saveClassification({ id: "cat-1", name: "Name" })).rejects.toThrow(
      "Failed to save classification (400: missing fields)"
    );
  });
});

describe("deleteClassification", () => {
  it("calls delete endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await deleteClassification("cat-2");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/aura/classifications/cat-2", {
      method: "DELETE"
    });
  });

  it("encodes ids in the URL", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await deleteClassification("cat/space");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/aura/classifications/cat%2Fspace",
      { method: "DELETE" }
    );
  });

  it("throws when delete fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("missing")
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteClassification("cat-3")).rejects.toThrow("Failed to delete classification (404: missing)");
  });
});

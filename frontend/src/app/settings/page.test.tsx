import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CodexUsage } from "../lib/usage";
import { fetchTranscripts, runTranscriptClassification } from "../lib/transcripts";
import SettingsPage from "./page";

const usageMock: CodexUsage = {
  plan_type: "pro",
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 42,
      limit_window_seconds: 60,
      reset_after_seconds: 30,
      reset_at: Math.floor(Date.now() / 1000) + 60
    },
    secondary_window: {
      used_percent: 68,
      limit_window_seconds: 60,
      reset_after_seconds: 30,
      reset_at: Math.floor(Date.now() / 1000) + 120
    }
  },
  code_review_rate_limit: null,
  additional_rate_limits: null,
  credits: {
    has_credits: true,
    unlimited: false,
    overage_limit_reached: false,
    balance: "$10",
    approx_local_messages: [1, 2],
    approx_cloud_messages: [3]
  },
  spend_control: { reached: false },
  promo: null
};

vi.mock("../lib/usage", () => ({
  fetchUsage: vi.fn(() => Promise.resolve(usageMock))
}));

vi.mock("../lib/classifications", () => ({
  fetchClassifications: vi.fn(() => Promise.resolve([])),
  saveClassification: vi.fn(),
  deleteClassification: vi.fn()
}));

vi.mock("../lib/transcripts");

const fetchTranscriptsMock = vi.mocked(fetchTranscripts);
const runTranscriptClassificationMock = vi.mocked(runTranscriptClassification);

vi.mock("../lib/transcriptClassifications", () => ({
  saveTranscriptClassification: vi.fn(),
  deleteTranscriptClassification: vi.fn()
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    fetchTranscriptsMock.mockResolvedValue({
      transcripts: [],
      total: 0,
      limit: 25,
      hasMore: false
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the view selector and toggles panels", async () => {
    render(<SettingsPage />);

    await screen.findByRole("tab", { name: "Usage monitoring" });
    screen.getByRole("tab", { name: "Classification metadata" });
    screen.getByRole("tab", { name: /Transcript history/ });

    await screen.findByRole("heading", { name: "Usage monitoring" });
    await screen.findByText("Raw payload");

    fireEvent.click(screen.getByRole("tab", { name: "Classification metadata" }));
    await screen.findByRole("heading", { name: "Manage classification metadata" });
    expect(screen.queryByText("Raw payload")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Transcript history/ }));
    await screen.findByRole("heading", { name: "Global transcript history" });
    expect(screen.queryByRole("heading", { name: "Manage classification metadata" })).toBeNull();
  });

  it("defaults to showing unclassified transcripts and renders the badge", async () => {
    fetchTranscriptsMock.mockResolvedValue({
      transcripts: [],
      total: 3,
      limit: 25,
      hasMore: false
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Transcript history/ }));
    await screen.findByRole("heading", { name: "Global transcript history" });

    expect(fetchTranscriptsMock.mock.calls.some((call) => call[0]?.classificationState === "unclassified")).toBe(true);
    const transcriptsTab = screen.getByRole("tab", { name: /Transcript history/ });
    expect(transcriptsTab.textContent).toContain("Transcript history");
    expect(transcriptsTab.textContent).toContain("3");
    const filterButton = screen.getByRole("button", { name: "Show all transcripts" });
    expect(filterButton.getAttribute("aria-pressed")).toBe("true");
    screen.getByText(/Showing unclassified transcripts only/);
  });

  it("toggles between unclassified-only and all filters", async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Transcript history/ }));
    await screen.findByRole("heading", { name: "Global transcript history" });

    fetchTranscriptsMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Show all transcripts" }));
    await screen.findByText(/Showing every transcript entry/);

    expect(fetchTranscriptsMock.mock.calls.some((call) => call[0]?.classificationState === "all")).toBe(true);
    screen.getByRole("button", { name: "Show unclassified only" });
  });

  it("renders a delete button for each transcript and calls deleteTranscript", async () => {
    const transcripts = [
      {
        id: 101,
        sessionId: "s-1",
        payload: "transcript 1",
        metadata: null,
        receivedAt: "2026-04-01T12:00:00Z",
        classificationState: "unclassified" as const,
        classificationReason: null,
        classifications: []
      }
    ];

    fetchTranscriptsMock.mockResolvedValue({
      transcripts,
      total: 1,
      limit: 25,
      hasMore: false
    });

    const { deleteTranscript } = await import("../lib/transcripts");
    const deleteTranscriptMock = vi.mocked(deleteTranscript);
    deleteTranscriptMock.mockResolvedValue(undefined);

    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Transcript history/ }));

    await screen.findByText("transcript 1");
    const deleteButton = screen.getByTitle("Delete transcript");

    fireEvent.click(deleteButton);

    expect(window.confirm).toHaveBeenCalledWith("Delete this transcript? This action cannot be undone.");
    expect(deleteTranscriptMock).toHaveBeenCalledWith(101);

    await screen.findByText("No unclassified transcripts");
  });

  it("updates pagination summary and recomputes hasMore when a transcript is deleted", async () => {
    fetchTranscriptsMock.mockResolvedValue({
      transcripts: [
        {
          id: 101,
          sessionId: "s-1",
          payload: "to delete",
          metadata: null,
          receivedAt: "2026-04-01T12:00:00Z",
          classificationState: "unclassified" as const,
          classificationReason: null,
          classifications: []
        },
        {
          id: 102,
          sessionId: "s-1",
          payload: "stays",
          metadata: null,
          receivedAt: "2026-04-01T12:00:00Z",
          classificationState: "unclassified" as const,
          classificationReason: null,
          classifications: []
        }
      ],
      total: 26,
      limit: 25,
      hasMore: true
    });

    const { deleteTranscript } = await import("../lib/transcripts");
    const deleteTranscriptMock = vi.mocked(deleteTranscript);
    deleteTranscriptMock.mockResolvedValue(undefined);

    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Transcript history/ }));

    await screen.findByText("to delete");
    expect(screen.getByText(/Showing entries 1–25 of 26/)).toBeDefined();
    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton.hasAttribute("disabled")).toBe(false);

    const deleteButtons = screen.getAllByTitle("Delete transcript");
    fireEvent.click(deleteButtons[0]);

    await screen.findByText(/Showing entries 1–25 of 25/);
    expect(nextButton.hasAttribute("disabled")).toBe(true);
  });

  it("renders the classification update button and refreshes transcripts on click", async () => {
    const transcripts = [
      {
        id: 201,
        sessionId: "s-1",
        payload: "await classification",
        metadata: null,
        receivedAt: "2026-04-01T12:00:00Z",
        classificationState: "pending" as const,
        classificationReason: null,
        classifications: []
      }
    ];

    fetchTranscriptsMock.mockResolvedValue({
      transcripts,
      total: 1,
      limit: 25,
      hasMore: false
    });

    let resolveClassification: (() => void) | null = null;
    const classificationPromise = new Promise<void>((resolve) => {
      resolveClassification = resolve;
    });
    runTranscriptClassificationMock.mockReturnValue(classificationPromise);

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Transcript history/ }));
    await screen.findByText("Pending classification");

    const button = await screen.findByRole("button", { name: "Update classification" });
    const initialFetchCount = fetchTranscriptsMock.mock.calls.length;

    fireEvent.click(button);
    expect(runTranscriptClassificationMock).toHaveBeenCalledWith(201);
    await screen.findByText("Updating…");
    expect(button.disabled).toBe(true);

    resolveClassification?.();
    await waitFor(() => expect(button.disabled).toBe(false));
    await waitFor(() => expect(fetchTranscriptsMock.mock.calls.length).toBeGreaterThan(initialFetchCount));
  });

  it("displays the error message when classification fails and allows retry", async () => {
    const transcripts = [
      {
        id: 202,
        sessionId: "s-1",
        payload: "await failure",
        metadata: null,
        receivedAt: "2026-04-01T12:00:00Z",
        classificationState: "pending" as const,
        classificationReason: null,
        classifications: []
      }
    ];

    fetchTranscriptsMock.mockResolvedValue({
      transcripts,
      total: 1,
      limit: 25,
      hasMore: false
    });

    runTranscriptClassificationMock.mockRejectedValue(new Error("worker error"));

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Transcript history/ }));
    await screen.findByText("Pending classification");

    const button = await screen.findByRole("button", { name: "Update classification" });
    fireEvent.click(button);

    await screen.findByText("worker error");
    expect(button.disabled).toBe(false);
  });
});

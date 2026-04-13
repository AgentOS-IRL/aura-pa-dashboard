import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import FleetingNotesPage from "./page";
import * as classificationsLib from "../lib/classifications";
import * as transcriptsLib from "../lib/transcripts";

vi.mock("../lib/classifications", () => ({
  fetchClassificationStats: vi.fn(),
}));

vi.mock("../lib/transcripts", () => ({
  fetchTranscripts: vi.fn(),
}));

describe("FleetingNotesPage", () => {
  const mockStats = [
    { id: "cat-1", name: "Category 1", description: "Description 1", count: 10 },
    { id: "cat-2", name: "Category 2", description: "Description 2", count: 5 },
  ];

  const mockTranscripts = {
    transcripts: [
      {
        id: 1,
        sessionId: "s1",
        payload: "Transcript 1",
        metadata: null,
        receivedAt: new Date().toISOString(),
        classifications: [],
        classificationState: "pending",
        classificationReason: null
      },
    ],
    page: 1,
    limit: 10,
    total: 1,
    hasMore: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (classificationsLib.fetchClassificationStats as any).mockResolvedValue(mockStats);
    (transcriptsLib.fetchTranscripts as any).mockResolvedValue(mockTranscripts);
  });

  it("renders classification stats correctly", async () => {
    render(<FleetingNotesPage />);

    expect(screen.getByText(/loading classification stats/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Category 1")).toBeDefined();
      expect(screen.getByText("Category 2")).toBeDefined();
      expect(screen.getByText("10")).toBeDefined();
      expect(screen.getByText("5")).toBeDefined();
    });
  });

  it("opens modal when clicking a classification card", async () => {
    render(<FleetingNotesPage />);

    await waitFor(() => screen.getByText("Category 1"));
    
    fireEvent.click(screen.getByText("Category 1"));

    await waitFor(() => {
      expect(screen.getByText("Transcript 1")).toBeDefined();
      expect(screen.getByText("1 transcripts found")).toBeDefined();
    });

    expect(transcriptsLib.fetchTranscripts).toHaveBeenCalledWith(expect.objectContaining({
      classificationId: "cat-1"
    }));
  });

  it("closes modal when clicking close button", async () => {
    render(<FleetingNotesPage />);

    await waitFor(() => screen.getByText("Category 1"));
    fireEvent.click(screen.getByText("Category 1"));

    await waitFor(() => screen.getByText("Transcript 1"));
    
    const closeButton = screen.getByRole("button", { name: /close modal/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Transcript 1")).toBeNull();
    });
  });
});

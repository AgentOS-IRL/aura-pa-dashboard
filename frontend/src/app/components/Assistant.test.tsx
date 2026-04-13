import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Assistant from "./Assistant";
import React from "react";
import { useMicVAD } from "@ricky0123/vad-react";
import { useSessionContext } from "../context/session";

// Mock @ricky0123/vad-react
vi.mock("@ricky0123/vad-react", () => ({
  useMicVAD: vi.fn(),
  utils: {
    encodeWAV: vi.fn(),
    arrayBufferToBase64: vi.fn(),
  },
}));

// Mock useSessionContext
vi.mock("../context/session", () => ({
  useSessionContext: vi.fn(),
}));

// Mock audioUpload
vi.mock("../lib/audioUpload", () => ({
  createSessionId: vi.fn(() => "test-session-id"),
  uploadAudioChunk: vi.fn(),
}));

// Mock auraPath
vi.mock("../lib/auraPath", () => ({
  AURA_BASE_PATH: "/aura",
}));

describe("Assistant", () => {
  const mockSetSessionId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useSessionContext as any).mockReturnValue({
      sessionId: null,
      setSessionId: mockSetSessionId,
    });
  });

  it("renders loading state correctly", () => {
    (useMicVAD as any).mockReturnValue({
      loading: true,
      listening: false,
      userSpeaking: false,
      pause: vi.fn(),
      start: vi.fn(),
    });

    render(<Assistant />);

    expect(screen.getByText("Initializing Assistant...")).toBeDefined();
    expect(screen.getByText(/Loading Model.../i)).toBeDefined();
    expect(screen.getByText(/Session status: Awaiting VAD initialization.../i)).toBeDefined();
    expect(screen.getByText(/Upload status: Model loading.../i)).toBeDefined();
    
    const button = screen.getByRole("button", { name: /Loading Model.../i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders idle state correctly", () => {
    (useMicVAD as any).mockReturnValue({
      loading: false,
      listening: false,
      userSpeaking: false,
      pause: vi.fn(),
      start: vi.fn(),
    });

    render(<Assistant />);

    expect(screen.getByText("Assistant is sleeping")).toBeDefined();
    expect(screen.getByRole("button", { name: /Wake Assistant/i })).toBeDefined();
    expect(screen.getByText(/Session status: Idle/i)).toBeDefined();
  });

  it("renders listening state correctly", () => {
    (useMicVAD as any).mockReturnValue({
      loading: false,
      listening: true,
      userSpeaking: false,
      pause: vi.fn(),
      start: vi.fn(),
    });

    render(<Assistant />);

    expect(screen.getByText("Awaiting your voice...")).toBeDefined();
    expect(screen.getByRole("button", { name: /Stop Assistant/i })).toBeDefined();
  });

  it("renders user speaking state correctly", () => {
    (useMicVAD as any).mockReturnValue({
      loading: false,
      listening: true,
      userSpeaking: true,
      pause: vi.fn(),
      start: vi.fn(),
    });

    render(<Assistant />);

    expect(screen.getByText("I am listening...")).toBeDefined();
  });
});

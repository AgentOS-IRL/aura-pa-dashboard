import { Readable } from "stream";
import { describe, expect, it, vi, beforeEach } from "vitest";

const createTranscriptionMock = vi.fn();
const openAIConstructorMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: class {
      audio = {
        transcriptions: {
          create: createTranscriptionMock,
        },
      };

      constructor(options: Record<string, unknown>) {
        openAIConstructorMock(options);
      }
    },
  };
});

const mockedConfig = {
  apiKey: "sk-test",
  baseUrl: "https://api.example.com/v1",
  organization: "org-123",
  project: "proj-456",
};

vi.mock("../config/openaiTranscribe", () => ({
  getOpenAITranscribeConfig: vi.fn(() => mockedConfig),
}));

import { OpenAITranscribeClient } from "./openaiTranscribeClient";
import { getOpenAITranscribeConfig } from "../config/openaiTranscribe";
const getOpenAIConfigMock = vi.mocked(getOpenAITranscribeConfig);

describe("OpenAITranscribeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTranscriptionMock.mockResolvedValue({ text: "done" });
  });

  it("initializes the OpenAI SDK with the resolved configuration", () => {
    new OpenAITranscribeClient();

    expect(getOpenAIConfigMock).toHaveBeenCalledTimes(1);
    expect(openAIConstructorMock).toHaveBeenCalledWith({
      apiKey: mockedConfig.apiKey,
      baseURL: mockedConfig.baseUrl,
      organization: mockedConfig.organization,
      project: mockedConfig.project,
    });
  });

  it("sends the default model and response format, while honoring overrides", async () => {
    const client = new OpenAITranscribeClient();

    await client.transcribeStream("session-a", Readable.from("chunk"), {
      model: "custom-model",
      temperature: 0.4,
    });

    expect(createTranscriptionMock).toHaveBeenCalledTimes(1);
    const payload = createTranscriptionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.model).toBe("custom-model");
    expect(payload.response_format).toBe("text");
    expect(payload.temperature).toBe(0.4);
  });

  it("converts buffer inputs into readable streams", async () => {
    const client = new OpenAITranscribeClient();
    const buffer = Buffer.from("audio-data");

    await client.transcribeStream("session-b", buffer);

    const payload = createTranscriptionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.file).toBeInstanceOf(Readable);
  });

  it("wraps SDK errors with a descriptive message", async () => {
    const client = new OpenAITranscribeClient();
    const failure = new Error("network failure");
    createTranscriptionMock.mockRejectedValueOnce(failure);

    await expect(client.transcribeStream("session-c", Readable.from("x"))).rejects.toThrow(
      'OpenAI transcription failed for session "session-c": network failure'
    );
  });
});

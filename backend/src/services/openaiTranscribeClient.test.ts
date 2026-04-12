import { Readable } from "stream";
import { describe, expect, it, vi, beforeEach } from "vitest";

declare global {
  var __createTranscriptionMock: ReturnType<typeof vi.fn> | undefined;
  var __openAIConstructorMock: ReturnType<typeof vi.fn> | undefined;
}

vi.mock("openai", () => {
  const createTranscriptionMock = vi.fn();
  const openAIConstructorMock = vi.fn();
  const toFileMock = vi.fn(async (value) => value);

  globalThis.__createTranscriptionMock = createTranscriptionMock;
  globalThis.__openAIConstructorMock = openAIConstructorMock;

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
    toFile: toFileMock,
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

import { toFile } from "openai";
import { OpenAITranscribeClient } from "./openaiTranscribeClient";
import { getOpenAITranscribeConfig } from "../config/openaiTranscribe";
const getOpenAIConfigMock = vi.mocked(getOpenAITranscribeConfig);
const toFileMocked = vi.mocked(toFile);

function ensureOpenAIMocks() {
  const createTranscriptionMock = globalThis.__createTranscriptionMock;
  const openAIConstructorMock = globalThis.__openAIConstructorMock;
  if (!createTranscriptionMock || !openAIConstructorMock) {
    throw new Error("OpenAI mocks not initialized");
  }
  return { createTranscriptionMock, openAIConstructorMock };
}

describe("OpenAITranscribeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { createTranscriptionMock } = ensureOpenAIMocks();
    createTranscriptionMock.mockResolvedValue({ text: "done" });
    toFileMocked.mockImplementation(async (value) => value);
  });

  it("initializes the OpenAI SDK with the resolved configuration", () => {
    new OpenAITranscribeClient();

    const { openAIConstructorMock } = ensureOpenAIMocks();

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
    const chunkStream = Readable.from("chunk");

    await client.transcribeStream(
      "session-a",
      chunkStream,
      {
        model: "custom-model",
        temperature: 0.4,
      }
    );

    const { createTranscriptionMock } = ensureOpenAIMocks();
    expect(createTranscriptionMock).toHaveBeenCalledTimes(1);
    const payload = createTranscriptionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.model).toBe("custom-model");
    expect(payload.response_format).toBe("json");
    expect(payload.temperature).toBe(0.4);
    expect(toFileMocked).toHaveBeenCalledWith(chunkStream, "session-a.audio", undefined);
  });

  it("marks buffer uploads as files before sending", async () => {
    const client = new OpenAITranscribeClient();
    const buffer = Buffer.from("audio-data");

    await client.transcribeStream("session-b", buffer);

    const { createTranscriptionMock } = ensureOpenAIMocks();
    const payload = createTranscriptionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.file).toBe(buffer);
    expect(toFileMocked).toHaveBeenCalledWith(buffer, "session-b.audio", undefined);
  });

  it("accepts upload metadata overrides", async () => {
    const client = new OpenAITranscribeClient();
    const buffer = Buffer.from("audio-data");

    await client.transcribeStream(
      "session-custom",
      buffer,
      undefined,
      {
        fileName: "custom-recording.webm",
        contentType: "audio/webm",
      }
    );

    expect(toFileMocked).toHaveBeenCalledWith(buffer, "custom-recording.webm", { type: "audio/webm" });
  });

  it("wraps SDK errors with a descriptive message", async () => {
    const client = new OpenAITranscribeClient();
    const failure = new Error("network failure");
    const { createTranscriptionMock } = ensureOpenAIMocks();
    createTranscriptionMock.mockRejectedValueOnce(failure);

    await expect(client.transcribeStream("session-c", Readable.from("x"))).rejects.toThrow(
      'OpenAI transcription failed for session "session-c": network failure'
    );
  });
});

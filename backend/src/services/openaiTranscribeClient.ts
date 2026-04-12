import { Readable } from "stream";
import OpenAI, { type AudioResponseFormat } from "openai";
import { getOpenAITranscribeConfig, type OpenAITranscribeConfig } from "../config/openaiTranscribe";

type AudioTranscriptionParams = Parameters<OpenAI["audio"]["transcriptions"]["create"]>[0];
type AudioTranscriptionResult = Awaited<
  ReturnType<OpenAI["audio"]["transcriptions"]["create"]>
>;

export type OpenAITranscribeOptions = Partial<Omit<AudioTranscriptionParams, "file">>;

const DEFAULT_MODEL = "gpt-4o-transcribe";
const DEFAULT_RESPONSE_FORMAT: AudioResponseFormat = "json";

const DEFAULT_PAYLOAD: Pick<AudioTranscriptionParams, "model" | "response_format"> = {
  model: DEFAULT_MODEL,
  response_format: DEFAULT_RESPONSE_FORMAT,
};

function ensureReadable(input: Buffer | NodeJS.ReadableStream): NodeJS.ReadableStream {
  if (Buffer.isBuffer(input)) {
    return Readable.from(input);
  }

  return input;
}

export class OpenAITranscribeClient {
  private readonly client: OpenAI;

  constructor(config?: OpenAITranscribeConfig) {
    const resolvedConfig = config ?? getOpenAITranscribeConfig();
    this.client = new OpenAI({
      apiKey: resolvedConfig.apiKey,
      baseURL: resolvedConfig.baseUrl ?? undefined,
      organization: resolvedConfig.organization ?? undefined,
      project: resolvedConfig.project ?? undefined,
    });
  }

  public async transcribeStream(
    sessionId: string,
    input: Buffer | NodeJS.ReadableStream,
    options?: OpenAITranscribeOptions
  ): Promise<AudioTranscriptionResult> {
    try {
      const payload: AudioTranscriptionParams = {
        ...DEFAULT_PAYLOAD,
        ...options,
        file: ensureReadable(input),
      };

      return await this.client.audio.transcriptions.create(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI transcription failed for session "${sessionId}": ${message}`);
    }
  }
}

export type { AudioTranscriptionResult as OpenAITranscriptionResult };

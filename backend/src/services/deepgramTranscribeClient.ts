import { Readable } from "stream";
import { DeepgramClient } from "@deepgram/sdk";
import { getDeepgramConfig, type DeepgramConfig } from "../config/deepgram";

const DEFAULT_MODEL = "nova-3";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_SMART_FORMAT = true;
const DEFAULT_UTTERANCES = true;
const CONFIDENCE_THRESHOLD = 0.8;

export const DEFAULT_DEEPGRAM_OPTIONS = {
  model: DEFAULT_MODEL,
  language: DEFAULT_LANGUAGE,
  smart_format: DEFAULT_SMART_FORMAT,
  utterances: DEFAULT_UTTERANCES,
};

export type DeepgramTranscribeOptions = Partial<typeof DEFAULT_DEEPGRAM_OPTIONS>;

export interface DeepgramUtterance {
  transcript: string;
  confidence?: number;
  start?: number;
  end?: number;
  speaker?: number;
}

export interface DeepgramTranscriptionResult {
  text: string;
  transcript: string;
  utterances: DeepgramUtterance[];
  raw: Record<string, unknown> | unknown;
}

interface DeepgramResponseAlternative {
  transcript?: string;
  utterances?: DeepgramUtterance[];
}

interface DeepgramResponseChannel {
  alternatives?: DeepgramResponseAlternative[];
}

interface DeepgramListenResponse {
  results?: {
    channels?: DeepgramResponseChannel[];
  };
}

export class DeepgramTranscribeClient {
  private readonly client: DeepgramClient;

  constructor(config?: DeepgramConfig) {
    const resolvedConfig = config ?? getDeepgramConfig();
    this.client = new DeepgramClient({
      apiKey: resolvedConfig.apiKey,
      baseURL: resolvedConfig.baseUrl ?? undefined,
    });
  }

  public async transcribeStream(
    sessionId: string,
    input: Buffer | NodeJS.ReadableStream,
    options?: DeepgramTranscribeOptions
  ): Promise<DeepgramTranscriptionResult> {
    const mediaStream = Buffer.isBuffer(input) ? Readable.from(input) : input;
    const requestOptions = {
      ...DEFAULT_DEEPGRAM_OPTIONS,
      ...options,
    };

    try {
      const response = (await this.client.listen.v1.media.transcribeFile(
        mediaStream as unknown,
        requestOptions
      )) as DeepgramListenResponse;
      const alternative = response.results?.channels?.[0]?.alternatives?.[0];
      const utterances = Array.isArray(alternative?.utterances) ? alternative.utterances : [];

      const filteredUtterances = utterances.filter((utterance) => {
        if (typeof utterance?.confidence !== "number") {
          return true;
        }
        return utterance.confidence >= CONFIDENCE_THRESHOLD;
      }) as DeepgramUtterance[];

      const joinedTranscript = filteredUtterances
        .map((utterance) => utterance.transcript?.trim())
        .filter(Boolean)
        .join(" ");

      const fallbackTranscript = alternative?.transcript;
      const finalTranscript = joinedTranscript || (typeof fallbackTranscript === "string" ? fallbackTranscript : "");

      return {
        text: finalTranscript,
        transcript: finalTranscript,
        utterances: filteredUtterances,
        raw: response,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Deepgram transcription failed for session "${sessionId}": ${message}`);
    }
  }
}

export interface DeepgramTranscriptionMetadata {
  model: string;
  language: string;
  smart_format: boolean;
  utterances: boolean;
}

export const DEFAULT_DEEPGRAM_METADATA: DeepgramTranscriptionMetadata = {
  model: DEFAULT_MODEL,
  language: DEFAULT_LANGUAGE,
  smart_format: DEFAULT_SMART_FORMAT,
  utterances: DEFAULT_UTTERANCES,
};

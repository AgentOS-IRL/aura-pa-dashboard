import OpenAI, { toFile } from "openai";
import { getOpenAITranscribeConfig, type OpenAITranscribeConfig } from "../config/openaiTranscribe";

type AudioTranscriptionParams = OpenAI.Audio.Transcriptions.TranscriptionCreateParamsNonStreaming;
type OpenAITranscriptionPayload = OpenAI.Audio.TranscriptionCreateResponse & {
  _request_id?: string | null | undefined;
};

export type OpenAITranscriptionResult = OpenAITranscriptionPayload | string;
export type OpenAITranscribeOptions = Partial<Omit<AudioTranscriptionParams, "file">>;

const DEFAULT_MODEL: OpenAI.Audio.AudioModel = "gpt-4o-transcribe";
const DEFAULT_RESPONSE_FORMAT: OpenAI.Audio.AudioResponseFormat = "json";

const DEFAULT_PAYLOAD: Pick<AudioTranscriptionParams, "model" | "response_format"> = {
  model: DEFAULT_MODEL,
  response_format: DEFAULT_RESPONSE_FORMAT,
};

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
    options?: OpenAITranscribeOptions,
    uploadOptions?: UploadFileOptions
  ): Promise<OpenAITranscriptionResult> {
    try {
      const fileName = uploadOptions?.fileName ?? `${sessionId}.audio`;
      const fileOptions = uploadOptions?.contentType ? { type: uploadOptions.contentType } : undefined;
      const file = await toFile(input, fileName, fileOptions);

      const payload: AudioTranscriptionParams = {
        ...DEFAULT_PAYLOAD,
        ...options,
        file,
      };

      const response = await this.client.audio.transcriptions.create(payload);
      return response as OpenAITranscriptionResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI transcription failed for session "${sessionId}": ${message}`);
    }
  }
}

export const DEFAULT_TRANSCRIBE_MODEL = DEFAULT_MODEL;
export const DEFAULT_TRANSCRIBE_RESPONSE_FORMAT = DEFAULT_RESPONSE_FORMAT;

export interface UploadFileOptions {
  fileName?: string;
  contentType?: string;
}

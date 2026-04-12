import { type OpenAITranscriptionResult } from './openaiTranscribeClient';
import {
  DEFAULT_TRANSCRIBE_MODEL,
  DEFAULT_TRANSCRIBE_RESPONSE_FORMAT,
  OpenAITranscribeClient,
  type OpenAITranscribeOptions,
  type UploadFileOptions
} from './openaiTranscribeClient';
import { saveTranscript } from './transcriptStorage';

const defaultTranscribeClient = new OpenAITranscribeClient();

function normalizeSessionId(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('sessionId is required to persist transcripts');
  }
  return trimmed;
}

function normalizeExecutorId(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('executorId is required to persist transcripts');
  }
  return trimmed;
}

function ensureBuffer(chunk: Buffer): Buffer {
  if (!chunk || chunk.length === 0 || !Buffer.isBuffer(chunk)) {
    throw new Error('audio chunk must be a non-empty Buffer');
  }
  return chunk;
}

function buildBaseMetadata(executorId: string, options?: OpenAITranscribeOptions) {
  return {
    source: 'transcribe',
    executorId,
    model: options?.model ?? DEFAULT_TRANSCRIBE_MODEL,
    response_format: options?.response_format ?? DEFAULT_TRANSCRIBE_RESPONSE_FORMAT
  } as Record<string, unknown>;
}

export async function transcribeAndSaveAudio(
  sessionId: string,
  chunk: Buffer,
  executorId: string,
  options?: OpenAITranscribeOptions,
  uploadOptions?: UploadFileOptions,
  client: OpenAITranscribeClient = defaultTranscribeClient
): Promise<OpenAITranscriptionResult> {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const normalizedExecutorId = normalizeExecutorId(executorId);
  const safeChunk = ensureBuffer(chunk);
  const metadata = buildBaseMetadata(normalizedExecutorId, options);

  try {
    const transcription = await client.transcribeStream(
      normalizedSessionId,
      safeChunk,
      options,
      uploadOptions
    );
    const payload = transcription.text ?? JSON.stringify(transcription);
    saveTranscript(normalizedSessionId, payload, metadata);
    return transcription;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMetadata = { ...metadata, error: true, message };
    saveTranscript(normalizedSessionId, '', errorMetadata);
    throw error;
  }
}

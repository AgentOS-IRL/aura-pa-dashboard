import {
  DeepgramTranscribeClient,
  DeepgramTranscribeOptions,
  DeepgramTranscriptionResult,
  DEFAULT_DEEPGRAM_METADATA
} from './deepgramTranscribeClient';
import { saveTranscript } from './transcriptStorage';

const defaultTranscribeClient = new DeepgramTranscribeClient();

function normalizeSessionId(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('sessionId is required to persist transcripts');
  }
  return trimmed;
}

function ensureBuffer(chunk: Buffer): Buffer {
  if (!chunk || chunk.length === 0 || !Buffer.isBuffer(chunk)) {
    throw new Error('audio chunk must be a non-empty Buffer');
  }
  return chunk;
}

function getTextPayload(transcription: DeepgramTranscriptionResult | string): string {
  if (typeof transcription === 'string') {
    return transcription;
  }

  if (transcription && typeof transcription === 'object' && 'text' in transcription) {
    return transcription.text;
  }

  return JSON.stringify(transcription);
}

function buildBaseMetadata(options?: DeepgramTranscribeOptions) {
  return {
    source: 'transcribe',
    model: options?.model ?? DEFAULT_DEEPGRAM_METADATA.model,
    language: options?.language ?? DEFAULT_DEEPGRAM_METADATA.language,
    smart_format: options?.smart_format ?? DEFAULT_DEEPGRAM_METADATA.smart_format,
    utterances: options?.utterances ?? DEFAULT_DEEPGRAM_METADATA.utterances
  } as Record<string, unknown>;
}

export async function transcribeAndSaveAudio(
  sessionId: string,
  chunk: Buffer,
  options?: DeepgramTranscribeOptions,
  client: DeepgramTranscribeClient = defaultTranscribeClient
): Promise<DeepgramTranscriptionResult> {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const safeChunk = ensureBuffer(chunk);
  const metadata = buildBaseMetadata(options);

  try {
    const transcription = await client.transcribeStream(
      normalizedSessionId,
      safeChunk,
      options
    );
    const payload = getTextPayload(transcription);
    const trimmedPayload = payload?.trim() ?? '';
    if (trimmedPayload.length > 0) {
      saveTranscript(normalizedSessionId, payload, metadata);
    } else {
      // Deepgram sometimes returns empty or whitespace-only text; skip persistence to avoid blank rows.
    }
    return transcription;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMetadata = { ...metadata, error: true, message };
    saveTranscript(normalizedSessionId, '', errorMetadata);
    throw error;
  }
}

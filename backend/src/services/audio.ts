import {
  DeepgramTranscribeClient,
  DeepgramTranscribeOptions,
  DeepgramTranscriptionResult,
  DEFAULT_DEEPGRAM_METADATA
} from './deepgramTranscribeClient';
import { saveTranscript } from './transcriptStorage';
import { generateClassificationFromTranscript } from './classificationGenerator';
import { AUDIO_CONTEXTS } from '../constants/audioContext';

const defaultTranscribeClient = new DeepgramTranscribeClient();

function normalizeSessionId(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('sessionId is required to persist transcripts');
  }
  return trimmed;
}

function normalizeContextId(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

function buildBaseMetadata(options?: DeepgramTranscribeOptions, contextId?: string) {
  const metadata = {
    source: 'transcribe',
    model: options?.model ?? DEFAULT_DEEPGRAM_METADATA.model,
    language: options?.language ?? DEFAULT_DEEPGRAM_METADATA.language,
    smart_format: options?.smart_format ?? DEFAULT_DEEPGRAM_METADATA.smart_format,
    utterances: options?.utterances ?? DEFAULT_DEEPGRAM_METADATA.utterances
  } as Record<string, unknown>;

  if (contextId) {
    metadata.conversation_context = contextId;
  }

  return metadata;
}

export async function transcribeAndSaveAudio(
  sessionId: string,
  chunk: Buffer,
  contextId?: string,
  options?: DeepgramTranscribeOptions,
  client: DeepgramTranscribeClient = defaultTranscribeClient
): Promise<DeepgramTranscriptionResult> {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const safeChunk = ensureBuffer(chunk);
  const normalizedContextId = normalizeContextId(contextId);
  const metadata = buildBaseMetadata(options, normalizedContextId);

  try {
    const transcription = await client.transcribeStream(
      normalizedSessionId,
      safeChunk,
      options
    );
    const payload = getTextPayload(transcription);
    const trimmedPayload = payload?.trim() ?? '';
    let savedTranscript;
    if (trimmedPayload.length > 0) {
      savedTranscript = saveTranscript(normalizedSessionId, payload, metadata);
    } else {
      // Deepgram sometimes returns empty or whitespace-only text; skip persistence to avoid blank rows.
    }
    if (normalizedContextId === AUDIO_CONTEXTS.CLASSIFICATION_GENERATOR && savedTranscript) {
      void generateClassificationFromTranscript(savedTranscript, normalizedContextId).catch((error) => {
        console.error('Classification generator failed during upload for session', normalizedSessionId, error);
      });
    }
    return transcription;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMetadata = { ...metadata, error: true, message };
    saveTranscript(normalizedSessionId, '', errorMetadata);
    throw error;
  }
}

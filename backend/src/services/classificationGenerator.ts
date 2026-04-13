import { CodexClient } from './codexClient';
import { type TranscriptRecord } from './transcriptStorage';
import {
  saveClassification,
  findClassificationByNormalizedName,
  type SaveClassificationInput
} from './classificationStorage';
import { AUDIO_CONTEXTS } from '../constants/audioContext';

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'string'
    },
    name: {
      type: 'string'
    },
    description: {
      type: 'string'
    }
  },
  required: ['name'],
  additionalProperties: false
} as const;

let cachedClient: CodexClient | null = null;
function getCodexClient(): CodexClient {
  if (!cachedClient) {
    cachedClient = new CodexClient();
  }
  return cachedClient;
}

function buildPrompt(payload: string): string {
  return [
    'Use the transcript below to suggest exactly one named classification that captures the user request. Be conservative and only create or update a classification when the transcript clearly asks for it, and keep the scope limited to the request.',
    'Respond only with the JSON that matches the schema and do not add any prose.',
    'If the transcript simply records what the user said but does not roughly match any catalog entry, do not invent classifications.',
    'Only update or generate a classification when it directly answers the user’s request and stay within what was asked.',
    'When providing a classification, include the name and a supporting description that explains how it answers the request.',
    '\nTranscript:\n' + payload.trim()
  ].join('\n\n');
}

/**
 * `classification-generator` context is a UI-only signal. This service runs asynchronously and never blocks
 * the audio upload response. Failures are logged and do not propagate to the caller.
 */
export async function generateClassificationFromTranscript(
  record: TranscriptRecord,
  contextId: string,
  client?: CodexClient
): Promise<void> {
  if (contextId !== AUDIO_CONTEXTS.CLASSIFICATION_GENERATOR) {
    return;
  }

  const trimmedPayload = record.payload?.trim();
  if (!trimmedPayload) {
    return;
  }

  try {
    const response = (await (client ?? getCodexClient()).executeStructured(
      buildPrompt(trimmedPayload),
      CLASSIFICATION_SCHEMA,
      'ClassificationGenerator',
      'json_schema',
      undefined,
      false,
      true
    )) as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
    } | undefined;

    const rawName = typeof response?.name === 'string' ? response.name.trim() : '';
    if (!rawName) {
      console.warn('Classification generator response missing name', record.id);
      return;
    }

    const existing = findClassificationByNormalizedName(rawName);

    const rawDescription = typeof response?.description === 'string' ? response.description.trim() : '';
    const hasDescription = rawDescription.length > 0;
    if (!hasDescription && !existing) {
      console.warn('Skipping classification generator result without description', record.id, rawName);
      return;
    }

    const payloadToSave: SaveClassificationInput = {
      name: rawName
    };

    const rawId = typeof response?.id === 'string' ? response.id.trim() : '';
    if (rawId) {
      payloadToSave.id = rawId;
    } else if (existing) {
      payloadToSave.id = existing.id;
    }

    payloadToSave.description = hasDescription
      ? rawDescription
      : existing?.description ?? null;

    saveClassification(payloadToSave);
  } catch (error) {
    console.error('Unable to generate classification from transcript', record.id, error);
  }
}

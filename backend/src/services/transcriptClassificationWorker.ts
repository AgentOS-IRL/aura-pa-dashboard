import { CodexClient } from './codexClient';
import { updateTranscriptClassificationState } from './transcriptStorage';
import type { TranscriptRecord } from './transcriptStorage';
import { assignClassificationToTranscript, clearClassificationsForTranscript } from './transcriptClassificationStorage';
import { listClassifications } from './classificationStorage';

let cachedCodexClient: CodexClient | null = null;
function getCodexClient(): CodexClient {
  if (!cachedCodexClient) {
    cachedCodexClient = new CodexClient();
  }
  return cachedCodexClient;
}

function buildClassificationPrompt(record: TranscriptRecord, classifications: { id: string; name: string; description: string | null }[]): string {
  const classificationLines = classifications
    .map((classification, index) => {
      const description = classification.description ? `\n    description: ${classification.description}` : '';
      return `${index + 1}. id: ${classification.id}\n    name: ${classification.name}${description}`;
    })
    .join('\n\n');

  return (
    'Classify the transcript below by selecting the most appropriate classifications from the list.\n' +
    'Return only the JSON that matches the schema. Do not include any prose before or after the JSON.\n' +
    'Every response should include "classificationStatus" with either "classified" or "unclassified".\n' +
    'When the best match is one or more catalog entries, set "classificationStatus" to "classified" and include "classificationIds".\n' +
    'When nothing fits, set "classificationStatus" to "unclassified" and you may optionally provide "unclassifiedReason" to explain why.\n\n' +
    `Classifications:\n${classificationLines}\n\n` +
    `Transcript:\n${record.payload.trim()}`
  );
}

export async function classifyTranscriptWithCodex(record: TranscriptRecord, client?: CodexClient): Promise<void> {
  if (!record.payload || !record.payload.trim()) {
    return;
  }

  const classifications = listClassifications();
  if (!classifications.length) {
    return;
  }

  const prompt = buildClassificationPrompt(record, classifications);
  const schema = {
    type: 'object',
    properties: {
      classificationStatus: {
        type: 'string',
        enum: ['classified', 'unclassified']
      },
      classificationIds: {
        type: 'array',
        items: { type: 'string' }
      },
      unclassifiedReason: {
        type: 'string'
      }
    },
    required: ['classificationStatus'],
    additionalProperties: false,
    allOf: [
      {
        if: { properties: { classificationStatus: { const: 'classified' } } },
        then: {
          required: ['classificationIds'],
          properties: {
            unclassifiedReason: false
          }
        }
      }
    ]
  };

  try {
    const response = (await (client ?? getCodexClient()).executeStructured(
      prompt,
      schema,
      'TranscriptClassifications',
      'json_schema',
      undefined,
      false,
      true
    )) as {
      classificationStatus?: unknown;
      classificationIds?: unknown[];
      unclassifiedReason?: unknown;
    } | undefined;

    const classificationStatus = response?.classificationStatus === 'unclassified' ? 'unclassified' : 'classified';

    clearClassificationsForTranscript(record.id);

    if (classificationStatus === 'unclassified') {
      const reason =
        typeof response?.unclassifiedReason === 'string'
          ? response.unclassifiedReason.trim() || null
          : null;
      updateTranscriptClassificationState(record.id, 'unclassified', reason);
      return;
    }

    const returnedIds = Array.isArray(response?.classificationIds) ? response.classificationIds : [];
    const normalizedIds = returnedIds
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value): value is string => Boolean(value));
    const uniqueIds = Array.from(new Set(normalizedIds));

    const validIds = new Set(classifications.map((classification) => classification.id));
    for (const classificationId of uniqueIds) {
      if (!validIds.has(classificationId)) {
        continue;
      }
      assignClassificationToTranscript(record.id, classificationId);
    }

    updateTranscriptClassificationState(record.id, 'classified', null);
  } catch (error) {
    console.error('Unable to classify transcript with Codex', record.id, error);
  }
}

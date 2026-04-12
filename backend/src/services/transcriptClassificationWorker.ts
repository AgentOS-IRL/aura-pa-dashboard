import { CodexClient } from './codexClient';
import type { TranscriptRecord } from './transcriptStorage';
import { assignClassificationToTranscript } from './transcriptClassificationStorage';
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
    'Only respond with the JSON specified by the schema. Do not include any prose before or after the JSON.\n\n' +
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
      classificationIds: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['classificationIds'],
    additionalProperties: false
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
    )) as { classificationIds?: unknown[] } | undefined;

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
  } catch (error) {
    console.error('Unable to classify transcript with Codex', record.id, error);
  }
}

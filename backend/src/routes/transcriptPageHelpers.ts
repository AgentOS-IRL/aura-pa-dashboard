import type { TranscriptRecord } from '../services/transcriptStorage';
import { getClassificationsForTranscripts } from '../services/transcriptClassificationStorage';

export interface TranscriptWithClassifications extends TranscriptRecord {
  classifications: Array<{ id: string; name: string; description: string | null }>;
}

export function attachTranscriptClassifications<T extends { transcripts: TranscriptRecord[] }>(
  page: T
): T & { transcripts: TranscriptWithClassifications[] } {
  const transcriptIds = page.transcripts.map((record) => record.id);
  const assignments = getClassificationsForTranscripts(transcriptIds);

  const transcripts = page.transcripts.map((record) => ({
    ...record,
    classifications: (assignments.get(record.id) ?? []).map((assignment) => ({
      id: assignment.classificationId,
      name: assignment.name,
      description: assignment.description
    }))
  }));

  return { ...page, transcripts };
}

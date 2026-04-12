const TRANSCRIPT_ID_PATTERN = /^[1-9]\d*$/;

export function parseTranscriptId(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (!TRANSCRIPT_ID_PATTERN.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

export function normalizeTranscriptId(value: number | string | undefined): number {
  if (value === undefined || value === null) {
    throw new Error('transcriptId is required');
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error('transcriptId must be a positive integer');
    }
    return value;
  }

  const parsed = parseTranscriptId(value);
  if (parsed === null) {
    throw new Error('transcriptId must be a positive integer');
  }

  return parsed;
}

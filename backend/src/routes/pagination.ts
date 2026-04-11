const DEFAULT_TRANSCRIPT_LIMIT = 25;
const MAX_TRANSCRIPT_LIMIT = 100;
const DEFAULT_TRANSCRIPT_PAGE = 1;

function parsePositiveIntegerParam(raw: string | undefined): { value?: number; error?: string } {
  if (raw === undefined) {
    return {};
  }

  const trimmed = raw.trim();
  if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
    return { error: 'must be a positive integer' };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: 'must be a positive integer' };
  }

  return { value: parsed };
}

export function normalizeLimitParam(raw: string | undefined): { limit: number; error?: string } {
  const parsed = parsePositiveIntegerParam(raw);
  if (parsed.error) {
    return { limit: DEFAULT_TRANSCRIPT_LIMIT, error: `limit ${parsed.error}` };
  }

  const limit = parsed.value ?? DEFAULT_TRANSCRIPT_LIMIT;
  return { limit: Math.min(limit, MAX_TRANSCRIPT_LIMIT) };
}

export function normalizePageParam(raw: string | undefined): { page: number; error?: string } {
  const parsed = parsePositiveIntegerParam(raw);
  if (parsed.error) {
    return { page: DEFAULT_TRANSCRIPT_PAGE, error: `page ${parsed.error}` };
  }

  return { page: parsed.value ?? DEFAULT_TRANSCRIPT_PAGE };
}

export { DEFAULT_TRANSCRIPT_LIMIT, MAX_TRANSCRIPT_LIMIT, DEFAULT_TRANSCRIPT_PAGE };

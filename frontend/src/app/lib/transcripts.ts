import { BACKEND_PATH_PREFIX } from "./auraPath";
import type { ClassificationRecord } from "./classifications";

const isProd = process.env.NODE_ENV === "production";
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? (isProd ? "" : "http://localhost:4000")).replace(/\/$/, "");

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeMetadata = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) {
    return value;
  }
  return null;
};

const normalizeClassifications = (value: unknown): ClassificationRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const id = typeof item.id === "string" ? item.id : "";
      const name = typeof item.name === "string" ? item.name : "";
      const description =
        item.description === undefined || item.description === null
          ? null
          : typeof item.description === "string"
            ? item.description
            : null;

      if (!id || !name) {
        return null;
      }

      return { id, name, description };
    })
    .filter((entry): entry is ClassificationRecord => entry !== null);
};

const classificationStateValues = ['pending', 'classified', 'unclassified'] as const;
export type TranscriptClassificationState = (typeof classificationStateValues)[number];

const normalizeClassificationState = (value: unknown): TranscriptClassificationState => {
  if (typeof value === 'string' && classificationStateValues.includes(value as TranscriptClassificationState)) {
    return value as TranscriptClassificationState;
  }
  return 'pending';
};

const normalizeClassificationReason = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export interface TranscriptRecord {
  id: number;
  sessionId: string;
  payload: string;
  metadata: Record<string, unknown> | null;
  receivedAt: string;
  classificationState: TranscriptClassificationState;
  classificationReason: string | null;
  classifications: ClassificationRecord[];
}

export interface TranscriptPageResponse {
  transcripts: TranscriptRecord[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface FetchTranscriptsOptions {
  limit?: number;
  page?: number;
  classificationId?: string;
  classificationState?: TranscriptClassificationState | 'all';
  signal?: AbortSignal;
}

export async function fetchTranscripts(options?: FetchTranscriptsOptions): Promise<TranscriptPageResponse> {
  const path = `${BACKEND_PATH_PREFIX}/transcripts`;
  const params = new URLSearchParams();

  if (typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    params.set("limit", Math.floor(options.limit).toString());
  }

  if (typeof options?.page === "number" && Number.isFinite(options.page) && options.page > 0) {
    params.set("page", Math.floor(options.page).toString());
  }

  if (typeof options?.classificationId === "string" && options.classificationId.trim() !== "") {
    params.set("classificationId", options.classificationId.trim());
  }

  if (options?.classificationState && options.classificationState !== 'all') {
    params.set("classificationState", options.classificationState);
  }

  const query = params.toString();
  const url = `${BACKEND_BASE_URL}${path}${query ? `?${query}` : ""}`;

  const response = await fetch(url, { method: "GET", signal: options?.signal });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to fetch transcripts (${response.status}): ${message}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const rawTranscripts = Array.isArray(payload.transcripts) ? payload.transcripts : [];
  const transcripts: TranscriptRecord[] = rawTranscripts.map((record) => {
    if (!isRecord(record)) {
      return {
        id: 0,
        sessionId: "",
        payload: "",
        metadata: null,
        receivedAt: "",
        classificationState: "pending",
        classificationReason: null,
        classifications: []
      };
    }

    const id = typeof record.id === "number" && Number.isFinite(record.id) ? record.id : 0;
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
    const payloadValue = typeof record.payload === "string" ? record.payload : "";
    const receivedAt = typeof record.receivedAt === "string" ? record.receivedAt : "";

    return {
      id,
      sessionId,
      payload: payloadValue,
      metadata: normalizeMetadata(record.metadata),
      receivedAt,
      classificationState: normalizeClassificationState(record.classificationState),
      classificationReason: normalizeClassificationReason(record.classificationReason),
      classifications: normalizeClassifications(record.classifications)
    };
  });

  const page = typeof payload.page === "number" && Number.isFinite(payload.page) && payload.page > 0
    ? Math.floor(payload.page)
    : typeof options?.page === "number" && Number.isFinite(options.page) && options.page > 0
      ? Math.floor(options.page)
      : 1;

  const limit = typeof payload.limit === "number" && Number.isFinite(payload.limit) && payload.limit > 0
    ? Math.floor(payload.limit)
    : typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : 25;

  const total = typeof payload.total === "number" && Number.isFinite(payload.total) && payload.total >= 0
    ? payload.total
    : transcripts.length;
  const hasMore = payload.hasMore === true;

  return { transcripts, page, limit, total, hasMore };
}

export async function deleteTranscript(id: number): Promise<void> {
  const url = `${BACKEND_BASE_URL}${BACKEND_PATH_PREFIX}/transcripts/${id}`;
  const response = await fetch(url, { method: 'DELETE' });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to delete transcript ${id} (${response.status}): ${message}`);
  }
}

export async function deleteAllTranscripts(): Promise<void> {
  const url = `${BACKEND_BASE_URL}${BACKEND_PATH_PREFIX}/transcripts`;
  const response = await fetch(url, { method: 'DELETE' });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to delete transcripts (${response.status}): ${message}`);
  }
}

export async function runTranscriptClassification(transcriptId: number): Promise<void> {
  const url = `${BACKEND_BASE_URL}${BACKEND_PATH_PREFIX}/transcripts/${transcriptId}/classify`;
  const response = await fetch(url, { method: 'POST' });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to run classification for transcript ${transcriptId} (${response.status}): ${message}`);
  }
}

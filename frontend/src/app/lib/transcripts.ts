import { BACKEND_PATH_PREFIX } from "./auraPath";

const isProd = process.env.NODE_ENV === "production";
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? (isProd ? "" : "http://localhost:4000")).replace(/\/$/, "");

export interface TranscriptRecord {
  sessionId: string;
  payload: string;
  metadata: Record<string, unknown> | null;
  receivedAt: string;
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

  const query = params.toString();
  const url = `${BACKEND_BASE_URL}${path}${query ? `?${query}` : ""}`;

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to fetch transcripts (${response.status}): ${message}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const transcripts = Array.isArray(payload.transcripts)
    ? (payload.transcripts as TranscriptRecord[])
    : [];

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

const isProd = process.env.NODE_ENV === "production";
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? (isProd ? "" : "http://localhost:4000")).replace(/\/$/, "");

export interface TranscriptRecord {
  sessionId: string;
  payload: string;
  metadata: Record<string, unknown> | null;
  receivedAt: string;
}

interface TranscriptResponse {
  transcripts?: TranscriptRecord[];
}

export async function fetchTranscripts(sessionId: string, limit?: number): Promise<TranscriptRecord[]> {
  const normalizedId = sessionId?.trim();
  if (!normalizedId) {
    throw new Error("Session ID is required to read transcripts");
  }

  const path = `/sessions/${encodeURIComponent(normalizedId)}/transcript`;
  const params = new URLSearchParams();
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    params.set("limit", Math.floor(limit).toString());
  }

  const query = params.toString();
  const url = `${BACKEND_BASE_URL}${path}${query ? `?${query}` : ""}`;

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to fetch transcripts (${response.status}): ${message}`);
  }

  const payload = (await response.json()) as TranscriptResponse;
  return Array.isArray(payload.transcripts) ? payload.transcripts : [];
}

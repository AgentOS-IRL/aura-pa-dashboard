import { BACKEND_PATH_PREFIX } from "./auraPath";

const isProd = process.env.NODE_ENV === "production";
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? (isProd ? "" : "http://localhost:4000")).replace(/\/$/, "");

export interface TranscriptClassificationAssignment {
  transcriptId: number;
  classificationId: string;
  name: string;
  description: string | null;
  assignedAt: string;
}

const toErrorMessage = async (response: Response): Promise<string> => {
  const fallback = response.statusText || "Unknown error";
  const text = await response.text().catch(() => fallback);
  return `${response.status}: ${text}`;
};

export async function fetchTranscriptClassifications(
  transcriptId: number
): Promise<TranscriptClassificationAssignment[]> {
  const url = `${BACKEND_BASE_URL}${BACKEND_PATH_PREFIX}/transcripts/${transcriptId}/classifications`;
  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    const message = await toErrorMessage(response);
    throw new Error(`Failed to fetch transcript classifications (${message})`);
  }

  return (await response.json()) as TranscriptClassificationAssignment[];
}

export async function saveTranscriptClassification(
  transcriptId: number,
  classificationId: string
): Promise<TranscriptClassificationAssignment[]> {
  const url = `${BACKEND_BASE_URL}${BACKEND_PATH_PREFIX}/transcripts/${transcriptId}/classifications`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: classificationId })
  });

  if (!response.ok) {
    const message = await toErrorMessage(response);
    throw new Error(`Failed to save transcript classification (${message})`);
  }

  return (await response.json()) as TranscriptClassificationAssignment[];
}

export async function deleteTranscriptClassification(transcriptId: number, classificationId: string): Promise<void> {
  const url = `${BACKEND_BASE_URL}${BACKEND_PATH_PREFIX}/transcripts/${transcriptId}/classifications/${encodeURIComponent(
    classificationId
  )}`;
  const response = await fetch(url, { method: "DELETE" });

  if (!response.ok) {
    const message = await toErrorMessage(response);
    throw new Error(`Failed to delete transcript classification (${message})`);
  }
}

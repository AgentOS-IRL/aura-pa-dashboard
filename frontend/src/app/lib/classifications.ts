import { BACKEND_PATH_PREFIX } from "./auraPath";

const isProd = process.env.NODE_ENV === "production";
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? (isProd ? "" : "http://localhost:4000"))
  .replace(/\/$/, "");

export interface ClassificationRecord {
  id: string;
  name: string;
  description: string | null;
}

export interface ClassificationStats {
  id: string;
  name: string;
  description: string | null;
  count: number;
}

export interface SaveClassificationInput {
  id: string;
  name: string;
  description?: string | null;
}

const CLASSIFICATIONS_PATH = `${BACKEND_PATH_PREFIX}/classifications`;

const toErrorMessage = async (response: Response): Promise<string> => {
  const fallback = response.statusText || "Unknown error";
  const text = await response.text().catch(() => fallback);
  return `${response.status}: ${text}`;
};

export async function fetchClassifications(): Promise<ClassificationRecord[]> {
  const url = `${BACKEND_BASE_URL}${CLASSIFICATIONS_PATH}`;
  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    const message = await toErrorMessage(response);
    throw new Error(`Failed to fetch classifications (${message})`);
  }

  return (await response.json()) as ClassificationRecord[];
}

export async function fetchClassificationStats(): Promise<ClassificationStats[]> {
  const url = `${BACKEND_BASE_URL}${CLASSIFICATIONS_PATH}/stats`;
  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    const message = await toErrorMessage(response);
    throw new Error(`Failed to fetch classification stats (${message})`);
  }

  return (await response.json()) as ClassificationStats[];
}

export async function saveClassification(input: SaveClassificationInput): Promise<ClassificationRecord> {
  const url = `${BACKEND_BASE_URL}${CLASSIFICATIONS_PATH}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const message = await toErrorMessage(response);
    throw new Error(`Failed to save classification (${message})`);
  }

  return (await response.json()) as ClassificationRecord;
}

export async function deleteClassification(id: string): Promise<void> {
  const url = `${BACKEND_BASE_URL}${CLASSIFICATIONS_PATH}/${encodeURIComponent(id)}`;
  const response = await fetch(url, { method: "DELETE" });

  if (!response.ok) {
    const message = await toErrorMessage(response);
    throw new Error(`Failed to delete classification (${message})`);
  }
}

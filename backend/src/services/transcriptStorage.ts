import type Database from 'better-sqlite3';
import { getTranscriptDatabase } from '../config/database';

export interface TranscriptRecord {
  sessionId: string;
  payload: string;
  metadata: Record<string, unknown> | null;
  receivedAt: string;
}

function ensureMetadata(value?: Record<string, unknown>): string | null {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn('Unable to serialize transcript metadata, dropping it', error);
    return null;
  }
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    console.warn('Unable to deserialize transcript metadata, returning raw string', error);
    return null;
  }
}

export function createTranscriptStorage(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      metadata TEXT,
      received_at TEXT NOT NULL
    );
  `);

  const insertStmt = db.prepare(
    'INSERT INTO transcripts (session_id, payload, metadata, received_at) VALUES (?, ?, ?, ?)'
  );
  const selectStmt = db.prepare(
    'SELECT session_id, payload, metadata, received_at FROM transcripts WHERE session_id = ? ORDER BY received_at DESC LIMIT ?'
  );

  function normalizePayload(body: string | Buffer): string {
    if (Buffer.isBuffer(body)) {
      return body.toString('utf-8');
    }
    return body ?? '';
  }

  function saveTranscript(sessionId: string, body: string | Buffer, metadata?: Record<string, unknown>): void {
    const normalizedSessionId = sessionId?.trim();

    if (!normalizedSessionId) {
      throw new Error('sessionId is required to persist transcripts');
    }

    const payload = normalizePayload(body);
    const serializedMetadata = ensureMetadata(metadata);
    const receivedAt = new Date().toISOString();

    insertStmt.run(normalizedSessionId, payload, serializedMetadata, receivedAt);
  }

  function getRecentTranscripts(sessionId: string, limit = 25): TranscriptRecord[] {
    const normalizedSessionId = sessionId?.trim();

    if (!normalizedSessionId) {
      return [];
    }

    const rows = selectStmt.all(normalizedSessionId, limit) as Array<{
      session_id: string;
      payload: string;
      metadata: string | null;
      received_at: string;
    }>;

    return rows.map((row) => ({
      sessionId: row.session_id,
      payload: row.payload,
      metadata: parseMetadata(row.metadata),
      receivedAt: row.received_at
    }));
  }

  return {
    saveTranscript,
    getRecentTranscripts
  };
}

const defaultStorage = createTranscriptStorage(getTranscriptDatabase());

export const { saveTranscript, getRecentTranscripts } = defaultStorage;
export type TranscriptStorage = ReturnType<typeof createTranscriptStorage>;

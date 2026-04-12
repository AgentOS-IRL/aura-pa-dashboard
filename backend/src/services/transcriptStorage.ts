import type Database from 'better-sqlite3';
import { getTranscriptDatabase } from '../config/database';

export interface TranscriptRecord {
  id: number;
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

export function createTranscriptStorage(db: Database.Database) {
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
  const selectPageStmt = db.prepare(
    'SELECT id, session_id, payload, metadata, received_at FROM transcripts WHERE session_id = ? ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?'
  );
  const countStmt = db.prepare('SELECT COUNT(*) AS total FROM transcripts WHERE session_id = ?');
  const selectLatestStmt = db.prepare(
    'SELECT id, session_id, payload, metadata, received_at FROM transcripts ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?'
  );
  const countAllStmt = db.prepare('SELECT COUNT(*) AS total FROM transcripts');
  const deleteAllStmt = db.prepare('DELETE FROM transcripts');

  const DEFAULT_LIMIT = 25;
  const MAX_LIMIT = 100;
  const DEFAULT_PAGE = 1;

  function normalizePayload(body: string | Buffer): string {
    if (Buffer.isBuffer(body)) {
      return body.toString('utf-8');
    }
    return body ?? '';
  }

  function normalizeLimit(value?: number): number {
    if (value === undefined || !Number.isFinite(value)) {
      return DEFAULT_LIMIT;
    }
    const limit = Math.floor(value);
    if (limit <= 0) {
      return DEFAULT_LIMIT;
    }
    return Math.min(limit, MAX_LIMIT);
  }

  function normalizePage(value?: number): number {
    if (value === undefined || !Number.isFinite(value)) {
      return DEFAULT_PAGE;
    }
    const page = Math.floor(value);
    return page > 0 ? page : DEFAULT_PAGE;
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

  function getTranscriptPage(
    sessionId: string,
    options?: { page?: number; limit?: number }
  ): {
    transcripts: TranscriptRecord[];
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  } {
    const normalizedSessionId = sessionId?.trim();
    const limit = normalizeLimit(options?.limit);
    const page = normalizePage(options?.page);

    if (!normalizedSessionId) {
      return { transcripts: [], page, limit, total: 0, hasMore: false };
    }

    const offset = (page - 1) * limit;
    const rows = selectPageStmt.all(normalizedSessionId, limit, offset) as Array<{
      id: number;
      session_id: string;
      payload: string;
      metadata: string | null;
      received_at: string;
    }>;
    const countRow = countStmt.get(normalizedSessionId) as { total: number } | undefined;
    const total = typeof countRow?.total === 'number' ? countRow.total : 0;

    const transcripts = rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      payload: row.payload,
      metadata: parseMetadata(row.metadata),
      receivedAt: row.received_at
    }));

    return {
      transcripts,
      page,
      limit,
      total,
      hasMore: page * limit < total
    };
  }

  function getLatestTranscripts(options?: { page?: number; limit?: number }) {
    const limit = normalizeLimit(options?.limit);
    const page = normalizePage(options?.page);
    const offset = (page - 1) * limit;

    const rows = selectLatestStmt.all(limit, offset) as Array<{
      id: number;
      session_id: string;
      payload: string;
      metadata: string | null;
      received_at: string;
    }>;
    const countRow = countAllStmt.get() as { total: number } | undefined;
    const total = typeof countRow?.total === 'number' ? countRow.total : 0;

    const transcripts = rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      payload: row.payload,
      metadata: parseMetadata(row.metadata),
      receivedAt: row.received_at
    }));

    return {
      transcripts,
      page,
      limit,
      total,
      hasMore: page * limit < total
    };
  }

  function getRecentTranscripts(sessionId: string, limit?: number): TranscriptRecord[] {
    return getTranscriptPage(sessionId, { page: DEFAULT_PAGE, limit }).transcripts;
  }

  function deleteAllTranscripts(): number {
    const result = deleteAllStmt.run();
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  return {
    saveTranscript,
    getRecentTranscripts,
    getTranscriptPage,
    getLatestTranscripts,
    deleteAllTranscripts
  };
}

const defaultStorage = createTranscriptStorage(getTranscriptDatabase());

export const { saveTranscript, getRecentTranscripts, getTranscriptPage, getLatestTranscripts, deleteAllTranscripts } =
  defaultStorage;
export type TranscriptStorage = ReturnType<typeof createTranscriptStorage>;

import type Database from 'better-sqlite3';
import { getTranscriptDatabase } from '../config/database';
import { CLASSIFICATIONS_TABLE_SQL } from './classificationStorage';
import { TRANSCRIPT_CLASSIFICATIONS_TABLE_SQL } from './transcriptClassificationStorage';
export type TranscriptClassificationState = 'pending' | 'classified' | 'unclassified';

const DEFAULT_TRANSCRIPT_CLASSIFICATION_STATE: TranscriptClassificationState = 'pending';
export const VALID_TRANSCRIPT_CLASSIFICATION_STATES: TranscriptClassificationState[] = [
  'pending',
  'classified',
  'unclassified'
];

export interface TranscriptRecord {
  id: number;
  sessionId: string;
  payload: string;
  metadata: Record<string, unknown> | null;
  receivedAt: string;
  classificationState: TranscriptClassificationState;
  classificationReason: string | null;
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
      received_at TEXT NOT NULL,
    classification_state TEXT NOT NULL DEFAULT 'pending',
    classification_reason TEXT
  );
  `);
  db.exec(CLASSIFICATIONS_TABLE_SQL);
  db.exec(TRANSCRIPT_CLASSIFICATIONS_TABLE_SQL);

  function hasTranscriptColumn(columnName: string): boolean {
    const rows = db.prepare("PRAGMA table_info('transcripts')").all() as Array<{ name: string }>;
    return rows.some((row) => row.name === columnName);
  }

  function ensureTranscriptColumn(columnName: string, definition: string): void {
    if (!hasTranscriptColumn(columnName)) {
      db.exec(`ALTER TABLE transcripts ADD COLUMN ${definition}`);
    }
  }

  ensureTranscriptColumn('classification_state', "classification_state TEXT NOT NULL DEFAULT 'pending'");
  ensureTranscriptColumn('classification_reason', 'classification_reason TEXT');

  const resetClassificationStateStmt = db.prepare(
    'UPDATE transcripts SET classification_state = ? WHERE classification_state IS NULL'
  );
  resetClassificationStateStmt.run(DEFAULT_TRANSCRIPT_CLASSIFICATION_STATE);

  const TRANSCRIPT_SELECT_COLUMNS =
    'id, session_id, payload, metadata, received_at, classification_state, classification_reason';
  const TRANSCRIPT_SELECT_COLUMNS_WITH_ALIAS = TRANSCRIPT_SELECT_COLUMNS.split(', ')
    .map((column) => `t.${column}`)
    .join(', ');
  type TranscriptRow = {
    id: number;
    session_id: string;
    payload: string;
    metadata: string | null;
    received_at: string;
    classification_state: string | null;
    classification_reason: string | null;
  };

  const insertStmt = db.prepare(
    'INSERT INTO transcripts (session_id, payload, metadata, received_at, classification_state, classification_reason) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const selectPageStmt = db.prepare(
    `SELECT ${TRANSCRIPT_SELECT_COLUMNS} FROM transcripts WHERE session_id = ? ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`
  );
  const countStmt = db.prepare('SELECT COUNT(*) AS total FROM transcripts WHERE session_id = ?');
  const selectLatestStmt = db.prepare(
    `SELECT ${TRANSCRIPT_SELECT_COLUMNS} FROM transcripts ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`
  );
  const countAllStmt = db.prepare('SELECT COUNT(*) AS total FROM transcripts');
  const selectByClassificationStateStmt = db.prepare(
    `SELECT ${TRANSCRIPT_SELECT_COLUMNS} FROM transcripts WHERE classification_state = ? ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`
  );
  const countByClassificationStateStmt = db.prepare('SELECT COUNT(*) AS total FROM transcripts WHERE classification_state = ?');
  const deleteAllStmt = db.prepare('DELETE FROM transcripts');
  const selectTranscriptByIdStmt = db.prepare(
    `SELECT ${TRANSCRIPT_SELECT_COLUMNS} FROM transcripts WHERE id = ?`
  );
  const updateClassificationStateStmt = db.prepare(
    'UPDATE transcripts SET classification_state = ?, classification_reason = ? WHERE id = ?'
  );
  const deleteByIdStmt = db.prepare('DELETE FROM transcripts WHERE id = ?');

  const DEFAULT_LIMIT = 25;
  const MAX_LIMIT = 100;
  const DEFAULT_PAGE = 1;

  function normalizePayload(body: string | Buffer): string {
    if (Buffer.isBuffer(body)) {
      return body.toString('utf-8');
    }
    return body ?? '';
  }

  function doesTranscriptExist(transcriptId: number): boolean {
    const row = selectTranscriptByIdStmt.get(transcriptId);
    return row !== undefined;
  }

  function getTranscriptById(transcriptId: number | string | undefined): TranscriptRecord | null {
    const normalizedId = normalizeTranscriptId(transcriptId);
    const row = selectTranscriptByIdStmt.get(normalizedId) as TranscriptRow | undefined;
    if (!row) {
      return null;
    }
    return buildTranscriptRecord(row);
  }

  function deleteTranscript(transcriptId: number | string): number {
    const normalizedId = normalizeTranscriptId(transcriptId);
    const result = deleteByIdStmt.run(normalizedId);
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  function updateTranscriptClassificationState(
    transcriptId: number | string,
    state: TranscriptClassificationState,
    reason: string | null = null
  ): number {
    const normalizedId = normalizeTranscriptId(transcriptId);
    const normalizedReason = normalizeClassificationReason(reason);
    const result = updateClassificationStateStmt.run(state, normalizedReason, normalizedId);
    return typeof result.changes === 'number' ? result.changes : 0;
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

  function normalizeTranscriptId(value: number | string | undefined): number {
    if (value === undefined || value === null) {
      throw new Error('transcriptId is required');
    }
    const candidate = typeof value === 'string' ? parseInt(value.trim(), 10) : value;
    if (!Number.isFinite(candidate) || candidate <= 0) {
      throw new Error('transcriptId must be a positive integer');
    }
    return Math.floor(candidate);
  }

  function normalizeClassificationState(value?: string | null): TranscriptClassificationState {
    if (typeof value === 'string' && VALID_TRANSCRIPT_CLASSIFICATION_STATES.includes(value as TranscriptClassificationState)) {
      return value as TranscriptClassificationState;
    }
    return DEFAULT_TRANSCRIPT_CLASSIFICATION_STATE;
  }

  function normalizeClassificationReason(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  function buildTranscriptRecord(row: TranscriptRow): TranscriptRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      payload: row.payload,
      metadata: parseMetadata(row.metadata),
      receivedAt: row.received_at,
      classificationState: normalizeClassificationState(row.classification_state),
      classificationReason: normalizeClassificationReason(row.classification_reason)
    };
  }

  function saveTranscript(sessionId: string, body: string | Buffer, metadata?: Record<string, unknown>): TranscriptRecord {
    const normalizedSessionId = sessionId?.trim();

    if (!normalizedSessionId) {
      throw new Error('sessionId is required to persist transcripts');
    }

    const payload = normalizePayload(body);
    const serializedMetadata = ensureMetadata(metadata);
    const receivedAt = new Date().toISOString();

    const result = insertStmt.run(
      normalizedSessionId,
      payload,
      serializedMetadata,
      receivedAt,
      DEFAULT_TRANSCRIPT_CLASSIFICATION_STATE,
      null
    );
    const record: TranscriptRecord = {
      id: typeof result.lastInsertRowid === 'number' ? result.lastInsertRowid : Number(result.lastInsertRowid ?? 0),
      sessionId: normalizedSessionId,
      payload,
      metadata: parseMetadata(serializedMetadata),
      receivedAt,
      classificationState: DEFAULT_TRANSCRIPT_CLASSIFICATION_STATE,
      classificationReason: null
    };

    return record;
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
    const rows = selectPageStmt.all(normalizedSessionId, limit, offset) as TranscriptRow[];
    const countRow = countStmt.get(normalizedSessionId) as { total: number } | undefined;
    const total = typeof countRow?.total === 'number' ? countRow.total : 0;

    const transcripts = rows.map((row) => buildTranscriptRecord(row));

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

    const rows = selectLatestStmt.all(limit, offset) as TranscriptRow[];
    const countRow = countAllStmt.get() as { total: number } | undefined;
    const total = typeof countRow?.total === 'number' ? countRow.total : 0;

    const transcripts = rows.map((row) => buildTranscriptRecord(row));

    return {
      transcripts,
      page,
      limit,
      total,
      hasMore: page * limit < total
    };
  }

  const selectWithoutClassificationsStmt = db.prepare(
    `
      SELECT ${TRANSCRIPT_SELECT_COLUMNS_WITH_ALIAS}
      FROM transcripts t
      WHERE NOT EXISTS (
        SELECT 1 FROM transcript_classifications tc WHERE tc.transcript_id = t.id
      )
      ORDER BY t.received_at DESC, t.id DESC
      LIMIT ? OFFSET ?
    `
  );

  const countWithoutClassificationsStmt = db.prepare(
    `
      SELECT COUNT(*) AS total
      FROM transcripts t
      WHERE NOT EXISTS (
        SELECT 1 FROM transcript_classifications tc WHERE tc.transcript_id = t.id
      )
    `
  );

  function getTranscriptsWithoutClassifications(options?: { page?: number; limit?: number }) {
    const limit = normalizeLimit(options?.limit);
    const page = normalizePage(options?.page);
    const offset = (page - 1) * limit;

    const rows = selectWithoutClassificationsStmt.all(limit, offset) as TranscriptRow[];
    const countRow = countWithoutClassificationsStmt.get() as { total: number } | undefined;
    const total = typeof countRow?.total === 'number' ? countRow.total : 0;

    const transcripts = rows.map((row) => buildTranscriptRecord(row));

    return {
      transcripts,
      page,
      limit,
      total,
      hasMore: page * limit < total
    };
  }

  function getTranscriptsByClassificationState(
    state: TranscriptClassificationState,
    options?: { page?: number; limit?: number }
  ) {
    const limit = normalizeLimit(options?.limit);
    const page = normalizePage(options?.page);
    const offset = (page - 1) * limit;

    const rows = selectByClassificationStateStmt.all(state, limit, offset) as TranscriptRow[];
    const countRow = countByClassificationStateStmt.get(state) as { total: number } | undefined;
    const total = typeof countRow?.total === 'number' ? countRow.total : 0;

    const transcripts = rows.map((row) => buildTranscriptRecord(row));

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

  function getTranscriptsByClassification(
    classificationId: string,
    options?: { page?: number; limit?: number }
  ) {
    const limit = normalizeLimit(options?.limit);
    const page = normalizePage(options?.page);
    const offset = (page - 1) * limit;

    const selectByClassificationStmt = db.prepare(
      `
        SELECT ${TRANSCRIPT_SELECT_COLUMNS_WITH_ALIAS}
        FROM transcripts t
        JOIN transcript_classifications tc ON t.id = tc.transcript_id
        WHERE tc.classification_id = ?
        ORDER BY t.received_at DESC, t.id DESC
        LIMIT ? OFFSET ?
      `
    );

    const countByClassificationStmt = db.prepare(
      `
        SELECT COUNT(*) AS total
        FROM transcripts t
        JOIN transcript_classifications tc ON t.id = tc.transcript_id
        WHERE tc.classification_id = ?
      `
    );

    const rows = selectByClassificationStmt.all(classificationId, limit, offset) as TranscriptRow[];
    const countRow = countByClassificationStmt.get(classificationId) as { total: number } | undefined;
    const total = typeof countRow?.total === 'number' ? countRow.total : 0;

    const transcripts = rows.map((row) => buildTranscriptRecord(row));

    return {
      transcripts,
      page,
      limit,
      total,
      hasMore: page * limit < total
    };
  }

  return {
    saveTranscript,
    getRecentTranscripts,
    getTranscriptPage,
    getLatestTranscripts,
    getTranscriptsWithoutClassifications,
    getTranscriptsByClassification,
    getTranscriptsByClassificationState,
    getTranscriptById,
    deleteAllTranscripts,
    deleteTranscript,
    doesTranscriptExist,
    updateTranscriptClassificationState
  };
}

const defaultStorage = createTranscriptStorage(getTranscriptDatabase());

export const {
  saveTranscript,
  getRecentTranscripts,
  getTranscriptPage,
  getLatestTranscripts,
  getTranscriptsWithoutClassifications,
  getTranscriptsByClassification,
  getTranscriptsByClassificationState,
  getTranscriptById,
  deleteAllTranscripts,
  deleteTranscript,
  doesTranscriptExist,
  updateTranscriptClassificationState
} = defaultStorage;
export type TranscriptStorage = ReturnType<typeof createTranscriptStorage>;

import type Database from 'better-sqlite3';
import { getTranscriptDatabase } from '../config/database';
import { normalizeTranscriptId } from '../utils/transcriptId';

export interface TranscriptClassificationAssignment {
  transcriptId: number;
  classificationId: string;
  name: string;
  description: string | null;
  assignedAt: string;
}

function normalizeClassificationId(value: string | undefined): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    throw new Error('classificationId is required');
  }
  return normalized;
}

export function createTranscriptClassificationStorage(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transcript_classifications (
      transcript_id INTEGER NOT NULL,
      classification_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (transcript_id, classification_id),
      FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE,
      FOREIGN KEY (classification_id) REFERENCES classifications(id) ON DELETE CASCADE
    );
  `);

  const insertStmt = db.prepare(
    'INSERT INTO transcript_classifications (transcript_id, classification_id, assigned_at) VALUES (?, ?, ?) ON CONFLICT(transcript_id, classification_id) DO UPDATE SET assigned_at = excluded.assigned_at'
  );
  const deleteStmt = db.prepare(
    'DELETE FROM transcript_classifications WHERE transcript_id = ? AND classification_id = ?'
  );
  const deleteByTranscriptStmt = db.prepare('DELETE FROM transcript_classifications WHERE transcript_id = ?');
  const listByClassificationStmt = db.prepare(
    'SELECT transcript_id FROM transcript_classifications WHERE classification_id = ?'
  );

  function transformAssignment(row: {
    transcript_id: number;
    classification_id: string;
    name: string;
    description: string | null;
    assigned_at: string;
  }): TranscriptClassificationAssignment {
    return {
      transcriptId: row.transcript_id,
      classificationId: row.classification_id,
      name: row.name,
      description: row.description,
      assignedAt: row.assigned_at
    };
  }

  function queryAssignments(transcriptIds: number[]): TranscriptClassificationAssignment[] {
    if (!transcriptIds.length) {
      return [];
    }

    const placeholders = transcriptIds.map(() => '?').join(', ');
    const stmt = db.prepare(
      `
        SELECT tc.transcript_id, tc.classification_id, tc.assigned_at, c.name, c.description
        FROM transcript_classifications tc
        JOIN classifications c ON tc.classification_id = c.id
        WHERE tc.transcript_id IN (${placeholders})
        ORDER BY tc.assigned_at DESC, c.name COLLATE NOCASE ASC
      `
    );

    const rows = stmt.all(...transcriptIds) as Array<{
      transcript_id: number;
      classification_id: string;
      name: string;
      description: string | null;
      assigned_at: string;
    }>;

    return rows.map(transformAssignment);
  }

  function assignClassificationToTranscript(transcriptId: number | string, classificationId: string): TranscriptClassificationAssignment {
    const normalizedTranscriptId = normalizeTranscriptId(transcriptId);
    const normalizedClassificationId = normalizeClassificationId(classificationId);
    const assignedAt = new Date().toISOString();

    insertStmt.run(normalizedTranscriptId, normalizedClassificationId, assignedAt);

    const assignments = getClassificationsForTranscripts([normalizedTranscriptId]).get(normalizedTranscriptId) ?? [];
    return (
      assignments.find((assignment) => assignment.classificationId === normalizedClassificationId) ?? {
        transcriptId: normalizedTranscriptId,
        classificationId: normalizedClassificationId,
        name: normalizedClassificationId,
        description: null,
        assignedAt
      }
    );
  }

  function removeClassificationFromTranscript(transcriptId: number | string, classificationId: string): number {
    const normalizedTranscriptId = normalizeTranscriptId(transcriptId);
    const normalizedClassificationId = normalizeClassificationId(classificationId);
    const result = deleteStmt.run(normalizedTranscriptId, normalizedClassificationId);
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  function getClassificationsForTranscript(transcriptId: number | string): TranscriptClassificationAssignment[] {
    const normalizedTranscriptId = normalizeTranscriptId(transcriptId);
    return getClassificationsForTranscripts([normalizedTranscriptId]).get(normalizedTranscriptId) ?? [];
  }

  function getClassificationsForTranscripts(transcriptIds: number[]): Map<number, TranscriptClassificationAssignment[]> {
    const normalizedIds = Array.from(
      new Set(transcriptIds.map((value) => normalizeTranscriptId(value)))
    );

    const assignments = queryAssignments(normalizedIds);

    const map = new Map<number, TranscriptClassificationAssignment[]>();
    assignments.forEach((assignment) => {
      const bucket = map.get(assignment.transcriptId) ?? [];
      bucket.push(assignment);
      map.set(assignment.transcriptId, bucket);
    });

    normalizedIds.forEach((id) => {
      if (!map.has(id)) {
        map.set(id, []);
      }
    });

    return map;
  }

  function clearClassificationsForTranscript(transcriptId: number | string): number {
    const normalizedTranscriptId = normalizeTranscriptId(transcriptId);
    const result = deleteByTranscriptStmt.run(normalizedTranscriptId);
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  function listTranscriptIdsForClassification(classificationId: string): number[] {
    const normalizedClassificationId = normalizeClassificationId(classificationId);
    const rows = listByClassificationStmt.all(normalizedClassificationId) as Array<{ transcript_id: number }>;
    return rows.map((row) => row.transcript_id);
  }

  return {
    assignClassificationToTranscript,
    removeClassificationFromTranscript,
    getClassificationsForTranscript,
    getClassificationsForTranscripts,
    clearClassificationsForTranscript,
    listTranscriptIdsForClassification
  };
}

const defaultStorage = createTranscriptClassificationStorage(getTranscriptDatabase());

export const {
  assignClassificationToTranscript,
  removeClassificationFromTranscript,
  getClassificationsForTranscript,
  getClassificationsForTranscripts,
  clearClassificationsForTranscript,
  listTranscriptIdsForClassification
} = defaultStorage;

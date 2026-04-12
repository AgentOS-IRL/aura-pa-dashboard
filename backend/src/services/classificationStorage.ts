import type Database from 'better-sqlite3';
import { getTranscriptDatabase } from '../config/database';

export interface ClassificationRecord {
  id: string;
  name: string;
  description: string | null;
}

export interface SaveClassificationInput {
  id: string;
  name: string;
  description?: string | null;
}

function normalizeRequiredField(value: string | undefined, label: string): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    throw new Error(`${label} is required to persist classifications`);
  }
  return normalized;
}

export function createClassificationStorage(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classifications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );
  `);

  const upsertStmt = db.prepare(
    'INSERT INTO classifications (id, name, description) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description'
  );
  const selectByIdStmt = db.prepare('SELECT id, name, description FROM classifications WHERE id = ?');
  const listStmt = db.prepare(
    'SELECT id, name, description FROM classifications ORDER BY name COLLATE NOCASE ASC, id ASC'
  );
  const deleteAllStmt = db.prepare('DELETE FROM classifications');

  function saveClassification(input: SaveClassificationInput): ClassificationRecord {
    const id = normalizeRequiredField(input.id, 'id');
    const name = normalizeRequiredField(input.name, 'name');
    const description = input.description ?? null;

    upsertStmt.run(id, name, description);

    return { id, name, description };
  }

  function getClassificationById(id: string): ClassificationRecord | null {
    const normalizedId = normalizeRequiredField(id, 'id');
    const row = selectByIdStmt.get(normalizedId) as ClassificationRecord | undefined;
    return row ?? null;
  }

  function listClassifications(): ClassificationRecord[] {
    const rows = listStmt.all() as ClassificationRecord[];
    return rows;
  }

  function deleteAllClassifications(): number {
    const result = deleteAllStmt.run();
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  return { saveClassification, getClassificationById, listClassifications, deleteAllClassifications };
}

const defaultStorage = createClassificationStorage(getTranscriptDatabase());

export const {
  saveClassification,
  getClassificationById,
  listClassifications,
  deleteAllClassifications
} = defaultStorage;

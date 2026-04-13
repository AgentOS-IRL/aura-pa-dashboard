import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getTranscriptDatabase } from '../config/database';

export interface ClassificationRecord {
  id: string;
  name: string;
  description: string | null;
}

export interface SaveClassificationInput {
  id?: string;
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

function normalizeOptionalField(value: string | undefined | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

const SLUG_INVALID_CHARS = /[^a-z0-9-]/g;
const SLUG_HYPHEN_SEQUENCE = /-+/g;
const SLUG_TRIM = /^-+|-+$/g;
const MAX_SLUG_DUPLICATE_ATTEMPTS = 100;

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(SLUG_INVALID_CHARS, '-')
    .replace(SLUG_HYPHEN_SEQUENCE, '-')
    .replace(SLUG_TRIM, '');
}

export const CLASSIFICATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS classifications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
  );
`;

export function createClassificationStorage(db: Database.Database) {
  db.exec(CLASSIFICATIONS_TABLE_SQL);

  const upsertStmt = db.prepare(
    'INSERT INTO classifications (id, name, description) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description'
  );
  const selectByIdStmt = db.prepare('SELECT id, name, description FROM classifications WHERE id = ?');
  const listStmt = db.prepare(
    'SELECT id, name, description FROM classifications ORDER BY name COLLATE NOCASE ASC, id ASC'
  );
  const deleteAllStmt = db.prepare('DELETE FROM classifications');
  const deleteByIdStmt = db.prepare('DELETE FROM classifications WHERE id = ?');

  function ensureUniqueIdFromName(name: string): string {
    const baseSlug = slugifyName(name);
    if (!baseSlug) {
      return randomUUID();
    }

    let candidate = baseSlug;
    let suffix = 2;
    while (getClassificationById(candidate)) {
      if (suffix > MAX_SLUG_DUPLICATE_ATTEMPTS) {
        return randomUUID();
      }
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  function saveClassification(input: SaveClassificationInput): ClassificationRecord {
    const trimmedId = normalizeOptionalField(input.id ?? null);
    const name = normalizeRequiredField(input.name, 'name');
    const description = input.description ?? null;

    const idToPersist = trimmedId ?? ensureUniqueIdFromName(name);

    upsertStmt.run(idToPersist, name, description);

    return { id: idToPersist, name, description };
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

  function findClassificationByNormalizedName(name: string): ClassificationRecord | null {
    const normalized = normalizeClassificationName(name);
    if (!normalized) {
      return null;
    }

    const match = listClassifications().find(
      (entry) => normalizeClassificationName(entry.name) === normalized
    );
    return match ?? null;
  }

  function normalizeClassificationName(value: string | undefined | null): string {
    return value?.trim().toLowerCase() ?? '';
  }

  function deleteAllClassifications(): number {
    const result = deleteAllStmt.run();
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  function deleteClassificationById(id: string): number {
    const normalizedId = normalizeRequiredField(id, 'id');
    const result = deleteByIdStmt.run(normalizedId);
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  return {
    saveClassification,
    getClassificationById,
    listClassifications,
    findClassificationByNormalizedName,
    deleteAllClassifications,
    deleteClassificationById
  };
}

const defaultStorage = createClassificationStorage(getTranscriptDatabase());

export const {
  saveClassification,
  getClassificationById,
  listClassifications,
  findClassificationByNormalizedName,
  deleteAllClassifications,
  deleteClassificationById
} = defaultStorage;

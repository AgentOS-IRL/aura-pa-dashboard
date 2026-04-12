import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClassificationStorage } from './classificationStorage';

let db: Database.Database;

afterEach(() => {
  db.close();
});

describe('createClassificationStorage', () => {
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('creates the classifications table and persists rows', () => {
    const storage = createClassificationStorage(db);

    storage.saveClassification({
      id: 'cat-1',
      name: 'Critical',
      description: 'important tasks'
    });

    const record = storage.getClassificationById('cat-1');

    expect(record).toEqual({
      id: 'cat-1',
      name: 'Critical',
      description: 'important tasks'
    });
  });

  it('trims ids/names when saving and leaves description nullable', () => {
    const storage = createClassificationStorage(db);

    storage.saveClassification({
      id: '  cat-2  ',
      name: '  Deferred Priority  '
    });

    const record = storage.getClassificationById('cat-2');

    expect(record).toEqual({
      id: 'cat-2',
      name: 'Deferred Priority',
      description: null
    });
  });

  it('lists classifications ordered by name case-insensitively', () => {
    const storage = createClassificationStorage(db);

    storage.saveClassification({ id: '3', name: 'delta' });
    storage.saveClassification({ id: '1', name: 'Alpha' });
    storage.saveClassification({ id: '2', name: 'bravo' });

    const list = storage.listClassifications();

    expect(list.map((entry) => entry.name)).toEqual(['Alpha', 'bravo', 'delta']);
    expect(list.map((entry) => entry.id)).toEqual(['1', '2', '3']);
  });

  it('deleteAllClassifications removes rows and returns count', () => {
    const storage = createClassificationStorage(db);

    storage.saveClassification({ id: 'cat-1', name: 'One' });
    storage.saveClassification({ id: 'cat-2', name: 'Two' });

    const deleted = storage.deleteAllClassifications();

    expect(deleted).toBe(2);
    expect(storage.listClassifications()).toHaveLength(0);
  });

  it('deleteClassificationById trims input and returns number removed', () => {
    const storage = createClassificationStorage(db);

    storage.saveClassification({ id: 'cat-1', name: 'First' });
    storage.saveClassification({ id: 'cat-2', name: 'Second' });

    const deleted = storage.deleteClassificationById('  cat-2  ');

    expect(deleted).toBe(1);
    expect(storage.listClassifications()).toHaveLength(1);
    expect(storage.getClassificationById('cat-2')).toBeNull();
  });

  it('deleteClassificationById returns 0 when no row matches', () => {
    const storage = createClassificationStorage(db);

    const deleted = storage.deleteClassificationById('missing');

    expect(deleted).toBe(0);
  });
});

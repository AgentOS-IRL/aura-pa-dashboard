import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTranscriptStorage } from './transcriptStorage';
import { createTranscriptClassificationStorage } from './transcriptClassificationStorage';
import { createClassificationStorage } from './classificationStorage';

let db: Database.Database;

afterEach(() => {
  db.close();
});

describe('createTranscriptStorage', () => {
  beforeEach(() => {
    db = new Database(':memory:');
  });
  it('creates the transcripts table and persists the values', () => {
    const storage = createTranscriptStorage(db);

    const sessionId = 'session-abc';
    const saved = storage.saveTranscript(sessionId, 'hello', { source: 'redis' });

    const rows = storage.getRecentTranscripts(sessionId);

    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe(sessionId);
    expect(rows[0].payload).toBe('hello');
    expect(rows[0].metadata).toEqual({ source: 'redis' });
    expect(new Date(rows[0].receivedAt).toString()).not.toContain('Invalid Date');
    expect(typeof rows[0].id).toBe('number');
    expect(rows[0].id).toBeGreaterThan(0);
    expect(saved).toEqual(rows[0]);
  });

  it('loads saved transcripts by id via getTranscriptById', () => {
    const storage = createTranscriptStorage(db);

    const saved = storage.saveTranscript('session-load', 'payload');

    const found = storage.getTranscriptById(saved.id);
    expect(found).toEqual(saved);
    const foundByString = storage.getTranscriptById(`${saved.id}`);
    expect(foundByString).toEqual(saved);
  });

  it('returns null when no transcript exists for the requested id', () => {
    const storage = createTranscriptStorage(db);

    expect(storage.getTranscriptById(999)).toBeNull();
  });

  it('throws for invalid transcript ids', () => {
    const storage = createTranscriptStorage(db);

    expect(() => storage.getTranscriptById(0)).toThrow('transcriptId must be a positive integer');
    expect(() => storage.getTranscriptById(undefined)).toThrow('transcriptId is required');
  });

  it('supports buffers for payloads and trims session ids', () => {
    const storage = createTranscriptStorage(db);

    storage.saveTranscript('  session-xyz  ', Buffer.from('payload-bytes'));

    const rows = storage.getRecentTranscripts('session-xyz');

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toBe('payload-bytes');
    expect(rows[0].metadata).toBeNull();
  });

  it('tracks classification state and honors the update helper', () => {
    const storage = createTranscriptStorage(db);

    const saved = storage.saveTranscript('session-state', 'payload');

    expect(saved.classificationState).toBe('pending');
    expect(saved.classificationReason).toBeNull();

    storage.updateTranscriptClassificationState(saved.id, 'unclassified', '  no match  ');

    const unclassified = storage.getRecentTranscripts('session-state')[0];
    expect(unclassified.classificationState).toBe('unclassified');
    expect(unclassified.classificationReason).toBe('no match');

    storage.updateTranscriptClassificationState(saved.id, 'classified', null);

    const classified = storage.getRecentTranscripts('session-state')[0];
    expect(classified.classificationState).toBe('classified');
    expect(classified.classificationReason).toBeNull();
  });

  it('returns paginated transcripts with totals and hasMore metadata', () => {
    const storage = createTranscriptStorage(db);
    const sessionId = 'session-paging';
    const payloads = ['first', 'second', 'third', 'fourth', 'fifth'];

    payloads.forEach((value) => storage.saveTranscript(sessionId, value));

    const page = storage.getTranscriptPage(sessionId, { page: 2, limit: 2 });

    expect(page.page).toBe(2);
    expect(page.limit).toBe(2);
    expect(page.total).toBe(payloads.length);
    expect(page.hasMore).toBe(true);
    expect(page.transcripts).toHaveLength(2);
    expect(page.transcripts.map((record) => record.payload)).toEqual(['third', 'second']);
  });

  it('returns an empty result when the session id is missing', () => {
    const storage = createTranscriptStorage(db);

    const page = storage.getTranscriptPage('   ', { page: 5, limit: 50 });

    expect(page.page).toBe(5);
    expect(page.limit).toBe(50);
    expect(page.total).toBe(0);
    expect(page.hasMore).toBe(false);
    expect(page.transcripts).toHaveLength(0);
  });

  it('caps requested limits to the configured maximum', () => {
    const storage = createTranscriptStorage(db);
    const sessionId = 'session-limit';

    storage.saveTranscript(sessionId, 'value');

    const page = storage.getTranscriptPage(sessionId, { limit: 500 });

    expect(page.limit).toBe(100);
    expect(page.total).toBe(1);
    expect(page.transcripts).toHaveLength(1);
  });
});

describe('getLatestTranscripts', () => {
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('returns transcripts sorted by newest entries across all sessions', () => {
    const storage = createTranscriptStorage(db);
    const sessionName = 'session-history';
    ['first', 'second', 'third', 'fourth'].forEach((value) => storage.saveTranscript(sessionName, value));
    storage.saveTranscript('session-other', 'fifth');

    const page = storage.getLatestTranscripts({ limit: 3, page: 1 });

    expect(page.transcripts).toHaveLength(3);
    expect(page.transcripts.map((record) => record.payload)).toEqual(['fifth', 'fourth', 'third']);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(3);
    expect(page.total).toBe(5);
    expect(page.hasMore).toBe(true);
  });

  it('paginates through the global history', () => {
    const storage = createTranscriptStorage(db);
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach((value) => storage.saveTranscript('session', value));

    const page = storage.getLatestTranscripts({ limit: 4, page: 2 });

    expect(page.transcripts).toHaveLength(2);
    expect(page.transcripts.map((record) => record.payload)).toEqual(['b', 'a']);
    expect(page.page).toBe(2);
    expect(page.limit).toBe(4);
    expect(page.total).toBe(6);
    expect(page.hasMore).toBe(false);
  });

  it('caps overly large limits to the configured maximum', () => {
    const storage = createTranscriptStorage(db);

    storage.saveTranscript('session', 'value');

    const page = storage.getLatestTranscripts({ limit: 999 });

    expect(page.limit).toBe(100);
    expect(page.total).toBe(1);
    expect(page.transcripts).toHaveLength(1);
  });
});

describe('getTranscriptsByClassification', () => {
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('returns transcripts filtered by classification', () => {
    const storage = createTranscriptStorage(db);
    const classificationStorage = createClassificationStorage(db);
    const mappingStorage = createTranscriptClassificationStorage(db);

    classificationStorage.saveClassification({ id: 'cat-1', name: 'First' });
    classificationStorage.saveClassification({ id: 'cat-2', name: 'Second' });

    storage.saveTranscript('s1', 't1');
    storage.saveTranscript('s1', 't2');
    storage.saveTranscript('s1', 't3');

    const transcripts = storage.getLatestTranscripts({ limit: 10 }).transcripts;

    // t3 is transcripts[0], t2 is transcripts[1], t1 is transcripts[2]
    mappingStorage.assignClassificationToTranscript(transcripts[0].id, 'cat-1');
    mappingStorage.assignClassificationToTranscript(transcripts[2].id, 'cat-1');
    mappingStorage.assignClassificationToTranscript(transcripts[1].id, 'cat-2');

    const cat1Page = storage.getTranscriptsByClassification('cat-1', { limit: 10 });
    expect(cat1Page.total).toBe(2);
    expect(cat1Page.transcripts.map(t => t.payload)).toEqual(['t3', 't1']);

    const cat2Page = storage.getTranscriptsByClassification('cat-2', { limit: 10 });
    expect(cat2Page.total).toBe(1);
    expect(cat2Page.transcripts.map(t => t.payload)).toEqual(['t2']);
  });

  it('paginates transcripts for a classification', () => {
    const storage = createTranscriptStorage(db);
    const classificationStorage = createClassificationStorage(db);
    const mappingStorage = createTranscriptClassificationStorage(db);

    classificationStorage.saveClassification({ id: 'cat-p', name: 'Paging' });

    for (let i = 1; i <= 5; i++) {
      const saved = storage.saveTranscript('s', `t${i}`);
      mappingStorage.assignClassificationToTranscript(saved.id, 'cat-p');
    }

    const page1 = storage.getTranscriptsByClassification('cat-p', { limit: 2, page: 1 });
    expect(page1.transcripts).toHaveLength(2);
    expect(page1.transcripts.map(t => t.payload)).toEqual(['t5', 't4']);
    expect(page1.hasMore).toBe(true);

    const page3 = storage.getTranscriptsByClassification('cat-p', { limit: 2, page: 3 });
    expect(page3.transcripts).toHaveLength(1);
    expect(page3.transcripts.map(t => t.payload)).toEqual(['t1']);
    expect(page3.hasMore).toBe(false);
  });
});

describe('getTranscriptsByClassificationState', () => {
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('returns transcripts filtered by classification state', () => {
    const storage = createTranscriptStorage(db);

    const first = storage.saveTranscript('state', 'first');
    const second = storage.saveTranscript('state', 'second');
    const third = storage.saveTranscript('state', 'third');

    storage.updateTranscriptClassificationState(second.id, 'unclassified');
    storage.updateTranscriptClassificationState(third.id, 'unclassified');
    storage.updateTranscriptClassificationState(first.id, 'classified');

    const page = storage.getTranscriptsByClassificationState('unclassified', { limit: 10 });

    expect(page.transcripts.map((record) => record.payload)).toEqual(['third', 'second']);
    expect(page.total).toBe(2);
    expect(page.hasMore).toBe(false);
  });

  it('paginates filtered transcripts and reports hasMore', () => {
    const storage = createTranscriptStorage(db);

    for (let i = 1; i <= 3; i++) {
      const saved = storage.saveTranscript('state-paging', `t${i}`);
      storage.updateTranscriptClassificationState(saved.id, 'unclassified');
    }

    const page1 = storage.getTranscriptsByClassificationState('unclassified', { limit: 1, page: 1 });
    expect(page1.transcripts).toHaveLength(1);
    expect(page1.transcripts[0].payload).toBe('t3');
    expect(page1.total).toBe(3);
    expect(page1.hasMore).toBe(true);

    const page3 = storage.getTranscriptsByClassificationState('unclassified', { limit: 1, page: 3 });
    expect(page3.transcripts).toHaveLength(1);
    expect(page3.transcripts[0].payload).toBe('t1');
    expect(page3.hasMore).toBe(false);
  });
});

describe('getTranscriptsWithoutClassifications', () => {
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('returns only transcripts that lack any classification assignments', () => {
    const storage = createTranscriptStorage(db);
    const classificationStorage = createClassificationStorage(db);
    const mappingStorage = createTranscriptClassificationStorage(db);

    classificationStorage.saveClassification({ id: 'cat-1', name: 'First' });

    storage.saveTranscript('session', 'no labels');
    const labeled = storage.saveTranscript('session', 'labeled');
    mappingStorage.assignClassificationToTranscript(labeled.id, 'cat-1');

    const page = storage.getTranscriptsWithoutClassifications({ limit: 10, page: 1 });

    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
    expect(page.transcripts).toHaveLength(1);
    expect(page.transcripts[0].payload).toBe('no labels');
  });

  it('paginates through unlabeled transcripts and reports hasMore', () => {
    const storage = createTranscriptStorage(db);

    for (let i = 1; i <= 3; i++) {
      storage.saveTranscript('session', `chunk-${i}`);
    }

    const page1 = storage.getTranscriptsWithoutClassifications({ limit: 2, page: 1 });
    expect(page1.transcripts).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.transcripts.map((t) => t.payload)).toEqual(['chunk-3', 'chunk-2']);

    const page2 = storage.getTranscriptsWithoutClassifications({ limit: 2, page: 2 });
    expect(page2.transcripts).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
    expect(page2.transcripts[0].payload).toBe('chunk-1');
  });
});

describe('deleteAllTranscripts', () => {
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('purges all rows and reports the deleted count', () => {
    const storage = createTranscriptStorage(db);
    storage.saveTranscript('session-a', 'first');
    storage.saveTranscript('session-b', 'second');

    const deleted = storage.deleteAllTranscripts();

    expect(deleted).toBe(2);
    const page = storage.getLatestTranscripts({ limit: 10 });
    expect(page.total).toBe(0);
    expect(page.transcripts).toHaveLength(0);
  });

  it('returns zero when the table is already empty', () => {
    const storage = createTranscriptStorage(db);

    const deleted = storage.deleteAllTranscripts();

    expect(deleted).toBe(0);
    expect(storage.getLatestTranscripts().total).toBe(0);
  });
});

describe('deleteTranscript', () => {
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('deletes a single transcript and its associated classifications', () => {
    const storage = createTranscriptStorage(db);
    const classificationStorage = createClassificationStorage(db);
    const mappingStorage = createTranscriptClassificationStorage(db);

    classificationStorage.saveClassification({ id: 'cat-1', name: 'First' });
    const t1 = storage.saveTranscript('s1', 't1');
    const t2 = storage.saveTranscript('s1', 't2');

    mappingStorage.assignClassificationToTranscript(t1.id, 'cat-1');
    mappingStorage.assignClassificationToTranscript(t2.id, 'cat-1');

    expect(mappingStorage.getClassificationsForTranscript(t1.id)).toHaveLength(1);
    expect(mappingStorage.getClassificationsForTranscript(t2.id)).toHaveLength(1);

    const deleted = storage.deleteTranscript(t1.id);

    expect(deleted).toBe(1);
    expect(storage.getLatestTranscripts().total).toBe(1);
    expect(storage.getLatestTranscripts().transcripts[0].id).toBe(t2.id);

    // Verify cascade deletion
    expect(mappingStorage.getClassificationsForTranscript(t1.id)).toHaveLength(0);
    expect(mappingStorage.getClassificationsForTranscript(t2.id)).toHaveLength(1);
  });

  it('returns 0 when the transcript does not exist', () => {
    const storage = createTranscriptStorage(db);
    const deleted = storage.deleteTranscript(999);
    expect(deleted).toBe(0);
  });
});

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTranscriptStorage } from './transcriptStorage';

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
    storage.saveTranscript(sessionId, 'hello', { source: 'redis' });

    const rows = storage.getRecentTranscripts(sessionId);

    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe(sessionId);
    expect(rows[0].payload).toBe('hello');
    expect(rows[0].metadata).toEqual({ source: 'redis' });
    expect(new Date(rows[0].receivedAt).toString()).not.toContain('Invalid Date');
  });

  it('supports buffers for payloads and trims session ids', () => {
    const storage = createTranscriptStorage(db);

    storage.saveTranscript('  session-xyz  ', Buffer.from('payload-bytes'));

    const rows = storage.getRecentTranscripts('session-xyz');

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toBe('payload-bytes');
    expect(rows[0].metadata).toBeNull();
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

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
});

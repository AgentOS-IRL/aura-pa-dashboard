import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClassificationStorage } from './classificationStorage';
import { createTranscriptClassificationStorage } from './transcriptClassificationStorage';
import { createTranscriptStorage } from './transcriptStorage';

describe('transcript classification storage', () => {
  let db: Database.Database;
  let classificationStorage: ReturnType<typeof createClassificationStorage>;
  let transcriptStorage: ReturnType<typeof createTranscriptStorage>;
  let mappingStorage: ReturnType<typeof createTranscriptClassificationStorage>;

  beforeEach(() => {
    db = new Database(':memory:');
    classificationStorage = createClassificationStorage(db);
    transcriptStorage = createTranscriptStorage(db);
    mappingStorage = createTranscriptClassificationStorage(db);
  });

  afterEach(() => {
    db.close();
  });

  it('assigns classifications and returns metadata', () => {
    classificationStorage.saveClassification({ id: 'cat-1', name: 'First' });
    transcriptStorage.saveTranscript('session-1', 'payload');
    const transcript = transcriptStorage.getLatestTranscripts({ limit: 1 }).transcripts[0];

    const assignment = mappingStorage.assignClassificationToTranscript(transcript.id, 'cat-1');
    expect(assignment.transcriptId).toBe(transcript.id);
    expect(assignment.name).toBe('First');
    expect(assignment.classificationId).toBe('cat-1');
    expect(new Date(assignment.assignedAt).toString()).not.toContain('Invalid Date');

    const assignments = mappingStorage.getClassificationsForTranscript(transcript.id);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].classificationId).toBe('cat-1');
  });

  it('ignores duplicate assignments and updates assignedAt', () => {
    classificationStorage.saveClassification({ id: 'cat-2', name: 'Second' });
    transcriptStorage.saveTranscript('session-2', 'payload');
    const transcript = transcriptStorage.getLatestTranscripts({ limit: 1 }).transcripts[0];

    mappingStorage.assignClassificationToTranscript(transcript.id, 'cat-2');
    mappingStorage.assignClassificationToTranscript(transcript.id, 'cat-2');

    const assignments = mappingStorage.getClassificationsForTranscript(transcript.id);
    expect(assignments).toHaveLength(1);
    expect(new Date(assignments[0].assignedAt).toString()).not.toContain('Invalid Date');
  });

  it('removes assignments via explicit delete and clear helpers', () => {
    classificationStorage.saveClassification({ id: 'cat-3', name: 'Third' });
    transcriptStorage.saveTranscript('session-transcript', 'value');
    const transcript = transcriptStorage.getLatestTranscripts({ limit: 1 }).transcripts[0];

    mappingStorage.assignClassificationToTranscript(transcript.id, 'cat-3');
    const removed = mappingStorage.removeClassificationFromTranscript(transcript.id, 'cat-3');
    expect(removed).toBe(1);
    expect(mappingStorage.getClassificationsForTranscript(transcript.id)).toHaveLength(0);

    mappingStorage.assignClassificationToTranscript(transcript.id, 'cat-3');
    const cleared = mappingStorage.clearClassificationsForTranscript(transcript.id);
    expect(cleared).toBe(1);
    expect(mappingStorage.getClassificationsForTranscript(transcript.id)).toHaveLength(0);
  });

  it('handles cascade when transcripts are deleted', () => {
    classificationStorage.saveClassification({ id: 'cat-4', name: 'Cascade' });
    transcriptStorage.saveTranscript('session-cascade', 'value');
    const transcript = transcriptStorage.getLatestTranscripts({ limit: 1 }).transcripts[0];

    mappingStorage.assignClassificationToTranscript(transcript.id, 'cat-4');
    transcriptStorage.deleteAllTranscripts();

    expect(mappingStorage.getClassificationsForTranscript(transcript.id)).toHaveLength(0);
    expect(mappingStorage.listTranscriptIdsForClassification('cat-4')).toHaveLength(0);
  });

  it('returns transcript ids by classification reference', () => {
    classificationStorage.saveClassification({ id: 'cat-5', name: 'Reference' });
    transcriptStorage.saveTranscript('session-ref', 'value1');
    transcriptStorage.saveTranscript('session-ref', 'value2');
    const ids = transcriptStorage.getLatestTranscripts({ limit: 2 }).transcripts.map((entry) => entry.id);

    ids.forEach((id) => mappingStorage.assignClassificationToTranscript(id, 'cat-5'));
    const mappedIds = mappingStorage.listTranscriptIdsForClassification('cat-5');
    expect(mappedIds.sort()).toEqual(ids.sort());
  });

  it('returns assignments for multiple transcript ids', () => {
    classificationStorage.saveClassification({ id: 'cat-6', name: 'Multi' });
    transcriptStorage.saveTranscript('session-multi', 'one');
    transcriptStorage.saveTranscript('session-multi', 'two');
    const transcripts = transcriptStorage.getLatestTranscripts({ limit: 2 }).transcripts;
    const map = mappingStorage.getClassificationsForTranscripts(transcripts.map((entry) => entry.id));

    expect(map.size).toBe(2);
    const assignments = Array.from(map.values()).flat();
    expect(Array.isArray(assignments)).toBe(true);
    expect(assignments).toHaveLength(0);
  });

  it('returns classification stats with transcript counts', () => {
    classificationStorage.saveClassification({ id: 'cat-1', name: 'First', description: 'Desc 1' });
    classificationStorage.saveClassification({ id: 'cat-2', name: 'Second', description: 'Desc 2' });

    transcriptStorage.saveTranscript('session-1', 'payload 1');
    transcriptStorage.saveTranscript('session-1', 'payload 2');
    const transcripts = transcriptStorage.getLatestTranscripts({ limit: 2 }).transcripts;

    // Assign 2 transcripts to cat-1, 1 transcript to cat-2
    mappingStorage.assignClassificationToTranscript(transcripts[0].id, 'cat-1');
    mappingStorage.assignClassificationToTranscript(transcripts[1].id, 'cat-1');
    mappingStorage.assignClassificationToTranscript(transcripts[0].id, 'cat-2');

    const stats = mappingStorage.getClassificationStats();
    expect(stats).toHaveLength(2);

    const stat1 = stats.find((s) => s.id === 'cat-1');
    expect(stat1).toBeDefined();
    expect(stat1?.name).toBe('First');
    expect(stat1?.description).toBe('Desc 1');
    expect(stat1?.count).toBe(2);

    const stat2 = stats.find((s) => s.id === 'cat-2');
    expect(stat2).toBeDefined();
    expect(stat2?.name).toBe('Second');
    expect(stat2?.description).toBe('Desc 2');
    expect(stat2?.count).toBe(1);
  });
});

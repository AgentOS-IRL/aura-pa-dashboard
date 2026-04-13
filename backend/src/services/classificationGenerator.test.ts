import '../tests/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./classificationStorage', () => ({
  saveClassification: vi.fn(),
  findClassificationByNormalizedName: vi.fn(),
  listClassifications: vi.fn()
}));

import type { CodexClient } from './codexClient';
import { generateClassificationFromTranscript } from './classificationGenerator';
import { findClassificationByNormalizedName, saveClassification, listClassifications } from './classificationStorage';
import type { TranscriptRecord } from './transcriptStorage';

const saveClassificationMock = vi.mocked(saveClassification);
const findClassificationMock = vi.mocked(findClassificationByNormalizedName);
const listClassificationsMock = vi.mocked(listClassifications);

const sampleRecord: TranscriptRecord = {
  id: 111,
  sessionId: 'session-123',
  payload: 'Please build a classification for what I just asked the assistant.',
  metadata: null,
  receivedAt: '2026-04-01T10:00:00.000Z',
  classificationState: 'pending',
  classificationReason: null
};

function createClient(response: Record<string, unknown>) {
  return {
    executeStructured: vi.fn().mockResolvedValue(response)
  } as unknown as CodexClient;
}

describe('generateClassificationFromTranscript', () => {
  beforeEach(() => {
    saveClassificationMock.mockReset();
    findClassificationMock.mockReset();
    listClassificationsMock.mockReset().mockReturnValue([]);
  });

  it('asks Codex for a classification and persists the result', async () => {
    const client = createClient({ name: 'Needs review', description: 'Contains special instructions' });

    await generateClassificationFromTranscript(sampleRecord, 'classification-generator', client);

    expect(client.executeStructured).toHaveBeenCalledWith(
      expect.stringContaining('Transcript:'),
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          name: expect.objectContaining({ type: 'string' }),
          description: expect.objectContaining({ type: 'string' })
        })
      }),
      'ClassificationGenerator',
      'json_schema',
      undefined,
      false,
      true
    );
    expect(saveClassificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Needs review',
        description: 'Contains special instructions'
      })
    );
  });

  it('reuses an existing classification id when names match case-insensitively', async () => {
    const existing = { id: 'existing-1', name: 'Needs Review', description: 'Old' };
    findClassificationMock.mockReturnValue(existing);
    const client = createClient({ name: 'needs review', description: 'Updated' });

    await generateClassificationFromTranscript(sampleRecord, 'classification-generator', client);

    expect(saveClassificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'existing-1',
        name: 'needs review',
        description: 'Updated'
      })
    );
  });

  it('skips when Codex does not return a name', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createClient({ description: 'no name' });

    await generateClassificationFromTranscript(sampleRecord, 'classification-generator', client);

    expect(saveClassificationMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('Classification generator response missing name', sampleRecord.id);
    consoleSpy.mockRestore();
  });

  it('skips when a new classification lacks a description', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createClient({ name: 'New thing' });

    await generateClassificationFromTranscript(sampleRecord, 'classification-generator', client);

    expect(saveClassificationMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Skipping classification generator result without description',
      sampleRecord.id,
      'New thing'
    );
    consoleSpy.mockRestore();
  });

  it('logs errors from Codex and does not throw', async () => {
    const client = { executeStructured: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as CodexClient;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await generateClassificationFromTranscript(sampleRecord, 'classification-generator', client);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Unable to generate classification from transcript',
      sampleRecord.id,
      expect.any(Error)
    );
    expect(saveClassificationMock).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does nothing when the context is not classification-generator', async () => {
    const client = createClient({ name: 'Needs review', description: 'Desc' });

    await generateClassificationFromTranscript(sampleRecord, 'general', client);

    expect(client.executeStructured).not.toHaveBeenCalled();
    expect(saveClassificationMock).not.toHaveBeenCalled();
  });
});

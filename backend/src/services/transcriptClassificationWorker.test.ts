import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./classificationStorage', () => ({
  listClassifications: vi.fn()
}));

vi.mock('./transcriptClassificationStorage', () => ({
  assignClassificationToTranscript: vi.fn()
}));

import type { CodexClient } from './codexClient';
import { classifyTranscriptWithCodex } from './transcriptClassificationWorker';
import { listClassifications } from './classificationStorage';
import { assignClassificationToTranscript } from './transcriptClassificationStorage';
import type { TranscriptRecord } from './transcriptStorage';

const listClassificationsMock = vi.mocked(listClassifications);
const assignClassificationMock = vi.mocked(assignClassificationToTranscript);

const sampleRecord: TranscriptRecord = {
  id: 123,
  sessionId: 'session-x',
  payload: 'Sample transcript text',
  metadata: { source: 'test' },
  receivedAt: '2026-04-12T10:00:00.000Z'
};

describe('classifyTranscriptWithCodex', () => {
  beforeEach(() => {
    listClassificationsMock.mockReset();
    assignClassificationMock.mockReset();
  });

  it('skips classification when no classifications are defined', async () => {
    listClassificationsMock.mockReturnValue([]);
    const client = { executeStructured: vi.fn() } as unknown as CodexClient;

    await classifyTranscriptWithCodex(sampleRecord, client);

    expect(client.executeStructured).not.toHaveBeenCalled();
    expect(assignClassificationMock).not.toHaveBeenCalled();
  });

  it('skips classification when the transcript payload is blank', async () => {
    listClassificationsMock.mockReturnValue([
      { id: 'cat-1', name: 'Cat One', description: null }
    ]);
    const client = { executeStructured: vi.fn() } as unknown as CodexClient;

    await classifyTranscriptWithCodex({ ...sampleRecord, payload: '   ' }, client);

    expect(client.executeStructured).not.toHaveBeenCalled();
    expect(assignClassificationMock).not.toHaveBeenCalled();
  });

  it('submits the prompt and assigns only known, deduplicated IDs', async () => {
    listClassificationsMock.mockReturnValue([
      { id: 'cat-1', name: 'Cat One', description: null },
      { id: 'cat-2', name: 'Cat Two', description: 'Description' }
    ]);
    const client = {
      executeStructured: vi
        .fn()
        .mockResolvedValue({ classificationIds: ['cat-1', 'cat-1', 'unknown', ' cat-2 '] })
    } as unknown as CodexClient;

    await classifyTranscriptWithCodex(sampleRecord, client);

    expect(client.executeStructured).toHaveBeenCalledWith(
      expect.stringContaining('Transcript:'),
      expect.objectContaining({
        classificationIds: expect.objectContaining({
          type: 'array',
          items: { type: 'string' }
        })
      }),
      'TranscriptClassifications',
      'json_schema',
      undefined,
      false,
      true
    );
    expect(assignClassificationMock).toHaveBeenCalledTimes(2);
    expect(assignClassificationMock).toHaveBeenCalledWith(sampleRecord.id, 'cat-1');
    expect(assignClassificationMock).toHaveBeenCalledWith(sampleRecord.id, 'cat-2');
  });

  it('logs and ignores Codex errors', async () => {
    listClassificationsMock.mockReturnValue([
      { id: 'cat-1', name: 'Cat One', description: null }
    ]);
    const client = {
      executeStructured: vi.fn().mockRejectedValue(new Error('boom'))
    } as unknown as CodexClient;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await classifyTranscriptWithCodex(sampleRecord, client);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Unable to classify transcript with Codex',
      sampleRecord.id,
      expect.any(Error)
    );
    expect(assignClassificationMock).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

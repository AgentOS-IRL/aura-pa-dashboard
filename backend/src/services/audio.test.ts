import '../tests/setup';
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';

const saveTranscriptMock = vi.fn();
vi.mock('./transcriptStorage', () => ({
  saveTranscript: (...args: unknown[]) => saveTranscriptMock(...args)
}));

import {
  DeepgramTranscribeClient,
  DeepgramTranscribeOptions,
  DeepgramTranscriptionResult,
  DEFAULT_DEEPGRAM_METADATA
} from './deepgramTranscribeClient';
import { transcribeAndSaveAudio } from './audio';

describe('transcribeAndSaveAudio', () => {
  beforeEach(() => {
    saveTranscriptMock.mockReset();
  });

  type TranscribeMock = MockedFunction<(
    sessionId: string,
    chunk: Buffer,
    options?: DeepgramTranscribeOptions
  ) => Promise<DeepgramTranscriptionResult>>;

  function createMockClient() {
    const transcribeStream = vi.fn() as TranscribeMock;
    transcribeStream.mockResolvedValue({ text: 'transcribed text', transcript: 'transcribed text', utterances: [], raw: {} });
    return {
      transcribeStream,
    } as DeepgramTranscribeClient & { transcribeStream: TranscribeMock };
  }

  it('runs the transcribe client and persists the returned text', async () => {
    const mockClient = createMockClient();

    const result = await transcribeAndSaveAudio('session-1', Buffer.from('audio'), 'executor-1', undefined, mockClient);

    expect(result.text).toBe('transcribed text');
    expect(saveTranscriptMock).toHaveBeenCalledWith(
      'session-1',
      'transcribed text',
      expect.objectContaining({
        source: 'transcribe',
        executorId: 'executor-1',
        model: DEFAULT_DEEPGRAM_METADATA.model,
        language: DEFAULT_DEEPGRAM_METADATA.language,
        smart_format: DEFAULT_DEEPGRAM_METADATA.smart_format,
        utterances: DEFAULT_DEEPGRAM_METADATA.utterances
      })
    );
    expect(mockClient.transcribeStream).toHaveBeenCalledTimes(1);
  });

  it('falls back to stringifying the full response when text is missing', async () => {
    const mockClient = createMockClient();
    const payload = { words: ['a', 'b'] } as unknown as DeepgramTranscriptionResult;
    mockClient.transcribeStream.mockResolvedValueOnce(payload);

    await transcribeAndSaveAudio('session-1', Buffer.from('audio'), 'executor-1', undefined, mockClient);

    expect(saveTranscriptMock).toHaveBeenCalledWith(
      'session-1',
      JSON.stringify(payload),
      expect.objectContaining({
        source: 'transcribe',
        executorId: 'executor-1'
      })
    );
  });

  it('includes overridden options in the metadata', async () => {
    const mockClient = createMockClient();
    const options: DeepgramTranscribeOptions = { model: 'custom-model', language: 'es' };

    await transcribeAndSaveAudio('session-1', Buffer.from('audio'), 'executor-2', options, mockClient);

    expect(saveTranscriptMock).toHaveBeenCalledWith(
      'session-1',
      'transcribed text',
      expect.objectContaining({
        executorId: 'executor-2',
        model: 'custom-model',
        language: 'es'
      })
    );
  });

  it('saves an error row before rejecting', async () => {
    const mockClient = createMockClient();
    const failure = new Error('boom');
    mockClient.transcribeStream.mockRejectedValueOnce(failure);

    await expect(
      transcribeAndSaveAudio('session-9', Buffer.from('audio'), 'executor-3', undefined, mockClient)
    ).rejects.toThrow('boom');

    expect(saveTranscriptMock).toHaveBeenCalledWith(
      'session-9',
      '',
      expect.objectContaining({
        source: 'transcribe',
        executorId: 'executor-3',
        error: true,
        message: 'boom'
      })
    );
  });

  it('validates the inputs', async () => {
    const mockClient = createMockClient();
    mockClient.transcribeStream.mockResolvedValue({ text: 'ok', transcript: 'ok', utterances: [], raw: {} });

    await expect(
      transcribeAndSaveAudio('   ', Buffer.from('audio'), 'executor-4', undefined, mockClient)
    ).rejects.toThrow('sessionId is required');

    await expect(
      transcribeAndSaveAudio('session-5', Buffer.from(''), 'executor-4', undefined, mockClient)
    ).rejects.toThrow('audio chunk must be a non-empty Buffer');
  });
});

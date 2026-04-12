import '../tests/setup';
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';

const saveTranscriptMock = vi.fn();
vi.mock('./transcriptStorage', () => ({
  saveTranscript: (...args: unknown[]) => saveTranscriptMock(...args)
}));

import {
  DEFAULT_TRANSCRIBE_MODEL,
  DEFAULT_TRANSCRIBE_RESPONSE_FORMAT,
  type OpenAITranscribeClient,
  type OpenAITranscribeOptions,
  type OpenAITranscriptionResult,
  type UploadFileOptions
} from './openaiTranscribeClient';
import { transcribeAndSaveAudio } from './audio';

describe('transcribeAndSaveAudio', () => {
  beforeEach(() => {
    saveTranscriptMock.mockReset();
  });

  type TranscribeMock = MockedFunction<
    (
      sessionId: string,
      chunk: Buffer,
      options?: OpenAITranscribeOptions,
      uploadOptions?: UploadFileOptions
    ) => Promise<OpenAITranscriptionResult>
  >;

  function createMockClient() {
    const transcribeStream = vi.fn() as TranscribeMock;
    return {
      transcribeStream
    } as OpenAITranscribeClient & { transcribeStream: TranscribeMock };
  }

  it('runs the transcribe client and persists the returned text', async () => {
    const mockClient = createMockClient();
    const transcriptionResult: OpenAITranscriptionResult = { text: 'transcribed text' } as OpenAITranscriptionResult;
    mockClient.transcribeStream.mockResolvedValueOnce(transcriptionResult);

    const result = await transcribeAndSaveAudio('session-1', Buffer.from('audio'), 'executor-1', undefined, undefined, mockClient);

    expect(result).toBe(transcriptionResult);
    expect(saveTranscriptMock).toHaveBeenCalledWith(
      'session-1',
      'transcribed text',
      expect.objectContaining({
        source: 'transcribe',
        executorId: 'executor-1',
        model: DEFAULT_TRANSCRIBE_MODEL,
        response_format: DEFAULT_TRANSCRIBE_RESPONSE_FORMAT
      })
    );
    expect(mockClient.transcribeStream).toHaveBeenCalledTimes(1);
  });

  it('falls back to stringifying the full response when text is missing', async () => {
    const mockClient = createMockClient();
    const payload = { words: ['a', 'b'] };
    mockClient.transcribeStream.mockResolvedValueOnce(payload as OpenAITranscriptionResult);

    await transcribeAndSaveAudio('session-1', Buffer.from('audio'), 'executor-1', undefined, undefined, mockClient);

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
    mockClient.transcribeStream.mockResolvedValueOnce({ text: 'text' } as OpenAITranscriptionResult);
    const options: OpenAITranscribeOptions = { model: 'custom-model', response_format: 'verbose_json' };

    await transcribeAndSaveAudio('session-1', Buffer.from('audio'), 'executor-2', options, undefined, mockClient);

    expect(saveTranscriptMock).toHaveBeenCalledWith(
      'session-1',
      'text',
      expect.objectContaining({
        executorId: 'executor-2',
        model: 'custom-model',
        response_format: 'verbose_json'
      })
    );
  });

  it('saves an error row before rejecting', async () => {
    const mockClient = createMockClient();
    const failure = new Error('boom');
    mockClient.transcribeStream.mockRejectedValueOnce(failure);

    await expect(
      transcribeAndSaveAudio('session-9', Buffer.from('audio'), 'executor-3', undefined, undefined, mockClient)
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
    mockClient.transcribeStream.mockResolvedValue({ text: 'ok' } as OpenAITranscriptionResult);

    await expect(
      transcribeAndSaveAudio('   ', Buffer.from('audio'), 'executor-4', undefined, undefined, mockClient)
    ).rejects.toThrow('sessionId is required');

    await expect(
      transcribeAndSaveAudio('session-5', Buffer.from(''), 'executor-4', undefined, undefined, mockClient)
    ).rejects.toThrow('audio chunk must be a non-empty Buffer');
  });

  it('passes upload metadata through to the client', async () => {
    const mockClient = createMockClient();
    mockClient.transcribeStream.mockResolvedValueOnce({ text: 'ok' } as OpenAITranscriptionResult);
    const uploadOptions: UploadFileOptions = {
      fileName: 'recording.webm',
      contentType: 'audio/webm'
    };

    await transcribeAndSaveAudio('session-10', Buffer.from('audio'), 'executor-5', undefined, uploadOptions, mockClient);

    expect(mockClient.transcribeStream).toHaveBeenCalledWith(
      'session-10',
      expect.any(Buffer),
      undefined,
      uploadOptions
    );
  });
});

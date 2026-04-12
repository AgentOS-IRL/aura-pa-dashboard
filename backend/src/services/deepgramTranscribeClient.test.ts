import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transcribeFileMock = vi.fn();
const deepgramConstructorMock = vi.fn();

vi.mock('@deepgram/sdk', () => ({
  DeepgramClient: class {
    public readonly listen = {
      v1: {
        media: {
          transcribeFile: transcribeFileMock,
        },
      },
    };

    constructor(options: Record<string, unknown>) {
      deepgramConstructorMock(options);
    }
  },
}));

const mockedConfig = {
  apiKey: 'dg-key',
  baseUrl: 'https://dg.example.com',
};

vi.mock('../config/deepgram', () => ({
  getDeepgramConfig: vi.fn(() => mockedConfig),
}));

import { getDeepgramConfig } from '../config/deepgram';
import { DeepgramTranscribeClient, DeepgramTranscribeOptions, DEFAULT_DEEPGRAM_OPTIONS } from './deepgramTranscribeClient';

const getConfigMock = vi.mocked(getDeepgramConfig);

describe('DeepgramTranscribeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transcribeFileMock.mockResolvedValue({
      results: {
        channels: [
          {
            alternatives: [
              {
                transcript: 'fallback',
                utterances: [],
              },
            ],
          },
        ],
      },
    });
  });

  it('initializes the SDK with resolved config', () => {
    new DeepgramTranscribeClient();

    expect(getConfigMock).toHaveBeenCalledTimes(1);
    expect(deepgramConstructorMock).toHaveBeenCalledWith({
      apiKey: mockedConfig.apiKey,
      baseURL: mockedConfig.baseUrl,
    });
  });

  it('sends default options when no overrides are provided', async () => {
    const client = new DeepgramTranscribeClient();
    await client.transcribeStream('session-a', Buffer.from('audio'));

    const [, options] = transcribeFileMock.mock.calls[0];
    expect(options).toEqual(DEFAULT_DEEPGRAM_OPTIONS);
  });

  it('streams buffers through Readable to Deepgram', async () => {
    const client = new DeepgramTranscribeClient();

    await client.transcribeStream('session-b', Buffer.from('payload'));

    const [streamArg] = transcribeFileMock.mock.calls[0];
    expect(streamArg).toBeInstanceOf(Readable);
  });

  it('honors overrides', async () => {
    const client = new DeepgramTranscribeClient();
    const overrides: DeepgramTranscribeOptions = {
      model: 'custom-model',
      language: 'fr',
      smart_format: false,
      utterances: false,
    };

    await client.transcribeStream('session-c', Readable.from('payload'), overrides);

    const [, options] = transcribeFileMock.mock.calls[0];
    expect(options).toEqual(expect.objectContaining(overrides));
  });

  it('filters low-confidence utterances and joins the transcript', async () => {
    const client = new DeepgramTranscribeClient();
    const response = {
      results: {
        channels: [
          {
            alternatives: [
              {
                transcript: 'fallback text',
                utterances: [
                  { transcript: 'low', confidence: 0.6 },
                  { transcript: 'keep', confidence: 0.9 },
                  { transcript: 'no-confidence' },
                ],
              },
            ],
          },
        ],
      },
    } as Record<string, unknown>;

    transcribeFileMock.mockResolvedValueOnce(response);

    const result = await client.transcribeStream('session-d', Buffer.from('x'));

    expect(result.utterances).toHaveLength(2);
    expect(result.text).toBe('keep no-confidence');
  });

  it('wraps SDK errors with a descriptive message', async () => {
    const client = new DeepgramTranscribeClient();
    const failure = new Error('network failure');
    transcribeFileMock.mockRejectedValueOnce(failure);

    await expect(client.transcribeStream('session-e', Buffer.from('x'))).rejects.toThrow(
      'Deepgram transcription failed for session "session-e": network failure'
    );
  });
});

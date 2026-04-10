import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const rpushBufferMock = vi.fn();
const expireMock = vi.fn();

vi.doMock('../config/redis', () => ({
  redisClient: {
    rpushBuffer: rpushBufferMock,
    expire: expireMock
  }
}));

describe('recordAudioChunk', () => {
  let recordAudioChunk: (sessionId: string, chunk: Buffer) => Promise<void>;
  let keyPrefix: string;
  let ttlSeconds: number;

  beforeAll(async () => {
    const audioModule = await import('./audio');
    recordAudioChunk = audioModule.recordAudioChunk;
    keyPrefix = audioModule.AUDIO_KEY_PREFIX;
    ttlSeconds = audioModule.AUDIO_TTL_SECONDS;
  });

  beforeEach(() => {
    rpushBufferMock.mockReset();
    expireMock.mockReset();
  });

  it('appends the binary and refreshes the TTL for a session', async () => {
    const chunk = Buffer.from('audio-data');
    await recordAudioChunk('session-123', chunk);

    expect(rpushBufferMock).toHaveBeenCalledWith(`${keyPrefix}/session-123`, chunk);
    expect(expireMock).toHaveBeenCalledWith(`${keyPrefix}/session-123`, ttlSeconds);
  });

  it('rejects requests without a valid sessionId', async () => {
    await expect(recordAudioChunk('   ', Buffer.from('a'))).rejects.toThrow('sessionId is required');
    expect(rpushBufferMock).not.toHaveBeenCalled();
  });

  it('rejects empty buffers', async () => {
    await expect(recordAudioChunk('session-123', Buffer.from(''))).rejects.toThrow('audio chunk must be a non-empty Buffer');
    expect(rpushBufferMock).not.toHaveBeenCalled();
  });
});

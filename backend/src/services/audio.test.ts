import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/redis', () => {
  const rpushBuffer = vi.fn();
  const expire = vi.fn();

  return {
    redisClient: {
      rpushBuffer,
      expire
    }
  };
});

import { redisClient } from '../config/redis';
import { AUDIO_KEY_PREFIX, AUDIO_TTL_SECONDS, recordAudioChunk } from './audio';

type RedisClientWithBuffer = typeof redisClient & {
  rpushBuffer: ReturnType<typeof vi.fn>;
};

const mockRpushBuffer = (redisClient as RedisClientWithBuffer).rpushBuffer;
const mockExpire = redisClient.expire as ReturnType<typeof vi.fn>;

describe('recordAudioChunk', () => {

  beforeEach(() => {
    mockRpushBuffer.mockReset();
    mockExpire.mockReset();
  });

  it('appends the binary and refreshes the TTL for a session', async () => {
    const chunk = Buffer.from('audio-data');
    await recordAudioChunk('session-123', chunk);

    // Assert the routed key uses the shared agentos/aura/audio namespace so cleanup consumers see it.
    expect(mockRpushBuffer).toHaveBeenCalledWith(`${AUDIO_KEY_PREFIX}/session-123`, chunk);
    expect(mockExpire).toHaveBeenCalledWith(`${AUDIO_KEY_PREFIX}/session-123`, AUDIO_TTL_SECONDS);
  });

  it('rejects requests without a valid sessionId', async () => {
    await expect(recordAudioChunk('   ', Buffer.from('a'))).rejects.toThrow('sessionId is required');
    expect(mockRpushBuffer).not.toHaveBeenCalled();
  });

  it('rejects empty buffers', async () => {
    await expect(recordAudioChunk('session-123', Buffer.from(''))).rejects.toThrow('audio chunk must be a non-empty Buffer');
    expect(mockRpushBuffer).not.toHaveBeenCalled();
  });
});

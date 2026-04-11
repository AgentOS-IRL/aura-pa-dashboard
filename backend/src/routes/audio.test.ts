import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

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
import * as audioService from '../services/audio';
import { createApp } from '../index';
import { withAuraBasePath } from '../config/auraPath';

type RedisClientWithBuffer = typeof redisClient & {
  rpushBuffer: ReturnType<typeof vi.fn>;
};

const mockRpushBuffer = (redisClient as RedisClientWithBuffer).rpushBuffer;
const mockExpire = redisClient.expire as ReturnType<typeof vi.fn>;

const recordAudioChunkSpy = vi.spyOn(audioService, 'recordAudioChunk');
const app = createApp();

describe('audio route', () => {
  beforeEach(() => {
    mockRpushBuffer.mockReset();
    mockExpire.mockReset();
    recordAudioChunkSpy.mockReset();
    recordAudioChunkSpy.mockResolvedValue(undefined);
  });

  it('returns 201 when the chunk is stored', async () => {
    recordAudioChunkSpy.mockResolvedValueOnce(undefined);

    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(201);

    expect(recordAudioChunkSpy).toHaveBeenCalledWith('session-42', expect.any(Buffer));
  });

  it('rejects missing files', async () => {
    await request(app).post(withAuraBasePath('/sessions/session-42/audio')).expect(400);
    expect(recordAudioChunkSpy).not.toHaveBeenCalled();
  });

  it('maps service failures to 500', async () => {
    recordAudioChunkSpy.mockRejectedValueOnce(new Error('boom'));

    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(500);
  });
});

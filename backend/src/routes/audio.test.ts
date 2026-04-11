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
import * as agentHealthService from '../services/agentHealth';

type RedisClientWithBuffer = typeof redisClient & {
  rpushBuffer: ReturnType<typeof vi.fn>;
};

const mockRpushBuffer = (redisClient as RedisClientWithBuffer).rpushBuffer;
const mockExpire = redisClient.expire as ReturnType<typeof vi.fn>;

const recordAudioChunkSpy = vi.spyOn(audioService, 'recordAudioChunk');
const getAgentHealthEntrySpy = vi.spyOn(agentHealthService, 'getAgentHealthEntry');
const app = createApp();
const EXECUTOR_HEADER = 'x-aura-executor-id';

describe('audio route', () => {
  beforeEach(() => {
    mockRpushBuffer.mockReset();
    mockExpire.mockReset();
    recordAudioChunkSpy.mockReset();
    recordAudioChunkSpy.mockResolvedValue(undefined);
    getAgentHealthEntrySpy.mockReset();
  });

  it('returns 201 when the chunk is stored', async () => {
    recordAudioChunkSpy.mockResolvedValueOnce(undefined);
    getAgentHealthEntrySpy.mockReturnValueOnce({
      id: 'executor-42',
      health: 'green',
      lastChecked: '2026-04-10T00:00:00.000Z'
    });

    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .set(EXECUTOR_HEADER, 'executor-42')
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

  it('requires an executor identifier', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(400);

    expect(recordAudioChunkSpy).not.toHaveBeenCalled();
    expect(getAgentHealthEntrySpy).not.toHaveBeenCalled();
  });

  it('rejects when the executor health is unknown', async () => {
    getAgentHealthEntrySpy.mockReturnValueOnce(undefined);

    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .set(EXECUTOR_HEADER, 'executor-unknown')
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(409);

    expect(recordAudioChunkSpy).not.toHaveBeenCalled();
  });

  it('rejects when the executor is not healthy', async () => {
    getAgentHealthEntrySpy.mockReturnValueOnce({
      id: 'executor-42',
      health: 'down',
      lastChecked: '2026-04-10T00:00:00.000Z'
    });

    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .set(EXECUTOR_HEADER, 'executor-42')
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(409);

    expect(recordAudioChunkSpy).not.toHaveBeenCalled();
  });

  it('maps service failures to 500', async () => {
    recordAudioChunkSpy.mockRejectedValueOnce(new Error('boom'));
    getAgentHealthEntrySpy.mockReturnValueOnce({
      id: 'executor-42',
      health: 'green',
      lastChecked: '2026-04-10T00:00:00.000Z'
    });

    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .set(EXECUTOR_HEADER, 'executor-42')
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(500);
  });
});

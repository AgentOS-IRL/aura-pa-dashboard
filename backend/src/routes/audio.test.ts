import '../tests/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import * as audioService from '../services/audio';
import { createApp } from '../index';
import { withAuraBasePath } from '../config/auraPath';
import * as agentHealthService from '../services/agentHealth';

type TranscribeResult = Awaited<ReturnType<typeof audioService.transcribeAndSaveAudio>>;
const transcribeAndSaveAudioSpy = vi.spyOn(audioService, 'transcribeAndSaveAudio');
const getAgentHealthEntrySpy = vi.spyOn(agentHealthService, 'getAgentHealthEntry');
const app = createApp();
const EXECUTOR_HEADER = 'x-aura-executor-id';

describe('audio route', () => {
  beforeEach(() => {
    transcribeAndSaveAudioSpy.mockReset();
    transcribeAndSaveAudioSpy.mockResolvedValue(undefined as unknown as TranscribeResult);
    getAgentHealthEntrySpy.mockReset();
  });

  it('returns 201 when transcription succeeds', async () => {
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

    expect(transcribeAndSaveAudioSpy).toHaveBeenCalledWith(
      'session-42',
      expect.any(Buffer),
      'executor-42',
      undefined,
      {
        fileName: 'chunk.webm',
        contentType: 'audio/webm'
      }
    );
  });

  it('rejects missing files', async () => {
    await request(app).post(withAuraBasePath('/sessions/session-42/audio')).expect(400);
    expect(transcribeAndSaveAudioSpy).not.toHaveBeenCalled();
  });

  it('requires an executor identifier', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(400);

    expect(transcribeAndSaveAudioSpy).not.toHaveBeenCalled();
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

    expect(transcribeAndSaveAudioSpy).not.toHaveBeenCalled();
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

    expect(transcribeAndSaveAudioSpy).not.toHaveBeenCalled();
  });

  it('maps transcription failures to 500', async () => {
    transcribeAndSaveAudioSpy.mockRejectedValueOnce(new Error('boom'));
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

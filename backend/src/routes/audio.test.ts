import '../tests/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import * as audioService from '../services/audio';
import { createApp } from '../index';
import { withAuraBasePath } from '../config/auraPath';

type TranscribeResult = Awaited<ReturnType<typeof audioService.transcribeAndSaveAudio>>;
const transcribeAndSaveAudioSpy = vi.spyOn(audioService, 'transcribeAndSaveAudio');
const app = createApp();

describe('audio route', () => {
  beforeEach(() => {
    transcribeAndSaveAudioSpy.mockReset();
    transcribeAndSaveAudioSpy.mockResolvedValue(undefined as unknown as TranscribeResult);
  });

  it('returns 201 when transcription succeeds', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(201);

    expect(transcribeAndSaveAudioSpy).toHaveBeenCalledWith('session-42', expect.any(Buffer));
  });

  it('rejects missing files', async () => {
    await request(app).post(withAuraBasePath('/sessions/session-42/audio')).expect(400);
    expect(transcribeAndSaveAudioSpy).not.toHaveBeenCalled();
  });

  it('rejects missing sessionId parameters', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/ /audio'))
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(400);

    expect(transcribeAndSaveAudioSpy).not.toHaveBeenCalled();
  });

  it('maps transcription failures to 500', async () => {
    transcribeAndSaveAudioSpy.mockRejectedValueOnce(new Error('boom'));

    await request(app)
      .post(withAuraBasePath('/sessions/session-42/audio'))
      .attach('audio', Buffer.from('hello'), {
        filename: 'chunk.webm',
        contentType: 'audio/webm'
      })
      .expect(500);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/transcriptStorage', () => ({
  saveTranscript: vi.fn()
}));

import { saveTranscript } from '../services/transcriptStorage';
import { createApp } from '../index';

const app = createApp();
const saveTranscriptMock = vi.mocked(saveTranscript);

describe('transcript route', () => {
  beforeEach(() => {
    saveTranscriptMock.mockReset();
  });

  it('returns 201 and persists the payload/metadata', async () => {
    await request(app)
      .post('/sessions/session-42/transcript')
      .send({ payload: 'transcript text', metadata: { source: 'web' } })
      .expect(201);

    expect(saveTranscriptMock).toHaveBeenCalledWith('session-42', 'transcript text', { source: 'web' });
  });

  it('allows omitting metadata', async () => {
    await request(app)
      .post('/sessions/session-42/transcript')
      .send({ payload: 'text only' })
      .expect(201);

    expect(saveTranscriptMock).toHaveBeenCalledWith('session-42', 'text only', undefined);
  });

  it('rejects missing payload', async () => {
    await request(app)
      .post('/sessions/session-42/transcript')
      .send({})
      .expect(400);

    expect(saveTranscriptMock).not.toHaveBeenCalled();
  });

  it('rejects invalid metadata values', async () => {
    await request(app)
      .post('/sessions/session-42/transcript')
      .send({ payload: 'hi', metadata: ['invalid'] })
      .expect(400);

    expect(saveTranscriptMock).not.toHaveBeenCalled();
  });

  it('maps service failures to 500', async () => {
    saveTranscriptMock.mockImplementation(() => {
      throw new Error('persist failed');
    });

    await request(app)
      .post('/sessions/session-42/transcript')
      .send({ payload: 'text' })
      .expect(500);
  });
});

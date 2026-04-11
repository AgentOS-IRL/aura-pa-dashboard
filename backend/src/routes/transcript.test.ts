import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/transcriptStorage', () => ({
  saveTranscript: vi.fn(),
  getRecentTranscripts: vi.fn()
}));

import { getRecentTranscripts, saveTranscript } from '../services/transcriptStorage';
import { createApp } from '../index';

const app = createApp();
const saveTranscriptMock = vi.mocked(saveTranscript);
const getRecentTranscriptsMock = vi.mocked(getRecentTranscripts);

describe('transcript route', () => {
  beforeEach(() => {
    saveTranscriptMock.mockReset();
    getRecentTranscriptsMock.mockReset();
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

  it('returns 400 for malformed JSON payloads', async () => {
    await request(app)
      .post('/sessions/session-42/transcript')
      .set('Content-Type', 'application/json')
      .send('{"payload": "oops"')
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

describe('transcript GET route', () => {
  beforeEach(() => {
    getRecentTranscriptsMock.mockReset();
  });

  it('returns transcripts when the service succeeds', async () => {
    const rows = [
      { sessionId: 'session-1', payload: 'hello', metadata: null, receivedAt: '2026-04-01T12:00:00Z' }
    ];
    getRecentTranscriptsMock.mockReturnValue(rows);

    const response = await request(app)
      .get('/sessions/session-1/transcript')
      .expect(200);

    expect(response.body).toEqual({ transcripts: rows });
    expect(getRecentTranscriptsMock).toHaveBeenCalledWith('session-1', undefined);
  });

  it('passes numeric limits to the service', async () => {
    getRecentTranscriptsMock.mockReturnValue([]);

    await request(app)
      .get('/sessions/session-1/transcript')
      .query({ limit: '5' })
      .expect(200);

    expect(getRecentTranscriptsMock).toHaveBeenCalledWith('session-1', 5);
  });

  it('falls back when invalid limits are provided', async () => {
    getRecentTranscriptsMock.mockReturnValue([]);

    await request(app)
      .get('/sessions/session-1/transcript')
      .query({ limit: 'NaN' })
      .expect(200);

    expect(getRecentTranscriptsMock).toHaveBeenCalledWith('session-1', undefined);
  });

  it('returns 400 when no session ID is provided', async () => {
    await request(app)
      .get('/sessions/%20/transcript')
      .expect(400);

    expect(getRecentTranscriptsMock).not.toHaveBeenCalled();
  });

  it('maps service errors to 500', async () => {
    getRecentTranscriptsMock.mockImplementation(() => {
      throw new Error('fetch failed');
    });

    await request(app)
      .get('/sessions/session-1/transcript')
      .expect(500);
  });
});

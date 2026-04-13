import '../tests/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/transcriptStorage', () => ({
  saveTranscript: vi.fn(),
  getTranscriptPage: vi.fn(),
  getLatestTranscripts: vi.fn(),
  getTranscriptsByClassification: vi.fn(),
  getTranscriptsByClassificationState: vi.fn(),
  deleteAllTranscripts: vi.fn(),
  deleteTranscript: vi.fn(),
  VALID_TRANSCRIPT_CLASSIFICATION_STATES: ['pending', 'classified', 'unclassified'] as const
}));
vi.mock('../services/transcriptClassificationStorage', () => ({
  getClassificationsForTranscripts: vi.fn()
}));

import {
  getTranscriptPage,
  getLatestTranscripts,
  getTranscriptsByClassification,
  getTranscriptsByClassificationState,
  saveTranscript,
  deleteAllTranscripts,
  deleteTranscript
} from '../services/transcriptStorage';
import { getClassificationsForTranscripts } from '../services/transcriptClassificationStorage';
import { createApp } from '../index';
import { withAuraBasePath } from '../config/auraPath';
import { MAX_TRANSCRIPT_LIMIT } from './transcript';

const app = createApp();
const saveTranscriptMock = vi.mocked(saveTranscript);
const getTranscriptPageMock = vi.mocked(getTranscriptPage);
const getLatestTranscriptsMock = vi.mocked(getLatestTranscripts);
const getTranscriptsByClassificationMock = vi.mocked(getTranscriptsByClassification);
const getTranscriptsByClassificationStateMock = vi.mocked(getTranscriptsByClassificationState);
const deleteAllTranscriptsMock = vi.mocked(deleteAllTranscripts);
const deleteTranscriptMock = vi.mocked(deleteTranscript);
const classificationMock = vi.mocked(getClassificationsForTranscripts);

beforeEach(() => {
  classificationMock.mockReset();
  classificationMock.mockReturnValue(new Map());
  getTranscriptsByClassificationMock.mockReset();
  getTranscriptsByClassificationStateMock.mockReset();
});

describe('transcript route', () => {
  beforeEach(() => {
    saveTranscriptMock.mockReset();
    getTranscriptPageMock.mockReset();
  });

  it('returns 201 and persists the payload/metadata', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/session-42/transcript'))
      .send({ payload: 'transcript text', metadata: { source: 'web' } })
      .expect(201);

    expect(saveTranscriptMock).toHaveBeenCalledWith('session-42', 'transcript text', { source: 'web' });
  });

  it('allows omitting metadata', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/session-42/transcript'))
      .send({ payload: 'text only' })
      .expect(201);

    expect(saveTranscriptMock).toHaveBeenCalledWith('session-42', 'text only', undefined);
  });

  it('rejects missing payload', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/session-42/transcript'))
      .send({})
      .expect(400);

    expect(saveTranscriptMock).not.toHaveBeenCalled();
  });

  it('rejects invalid metadata values', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/session-42/transcript'))
      .send({ payload: 'hi', metadata: ['invalid'] })
      .expect(400);

    expect(saveTranscriptMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON payloads', async () => {
    await request(app)
      .post(withAuraBasePath('/sessions/session-42/transcript'))
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
      .post(withAuraBasePath('/sessions/session-42/transcript'))
      .send({ payload: 'text' })
      .expect(500);
  });
});

describe('transcript GET route', () => {
  beforeEach(() => {
    getTranscriptPageMock.mockReset();
  });

  it('returns transcripts with pagination metadata when the service succeeds', async () => {
    const rows = [
      { id: 1, sessionId: 'session-1', payload: 'hello', metadata: null, receivedAt: '2026-04-01T12:00:00Z', classificationState: 'pending' as const, classificationReason: null }
    ];
    getTranscriptPageMock.mockReturnValue({
      transcripts: rows,
      page: 1,
      limit: 25,
      total: rows.length,
      hasMore: false
    });

    const response = await request(app)
      .get(withAuraBasePath('/sessions/session-1/transcript'))
      .expect(200);

    expect(response.body).toEqual({
      transcripts: rows.map((row) => ({ ...row, classifications: [] })),
      page: 1,
      limit: 25,
      total: rows.length,
      hasMore: false
    });
    expect(getTranscriptPageMock).toHaveBeenCalledWith('session-1', { limit: 25, page: 1 });
    expect(classificationMock).toHaveBeenCalledWith([rows[0].id]);
  });

  it('forwards pagination params to the storage helper', async () => {
    getTranscriptPageMock.mockReturnValue({
      transcripts: [],
      page: 2,
      limit: 5,
      total: 0,
      hasMore: false
    });

    await request(app)
      .get(withAuraBasePath('/sessions/session-1/transcript'))
      .query({ limit: '5', page: '2' })
      .expect(200);

    expect(getTranscriptPageMock).toHaveBeenCalledWith('session-1', { limit: 5, page: 2 });
  });

  it('caps limit values at the configured maximum', async () => {
    const expectedLimit = MAX_TRANSCRIPT_LIMIT;
    getTranscriptPageMock.mockReturnValue({
      transcripts: [],
      page: 1,
      limit: expectedLimit,
      total: 0,
      hasMore: false
    });

    await request(app)
      .get(withAuraBasePath('/sessions/session-1/transcript'))
      .query({ limit: `${expectedLimit + 20}` })
      .expect(200);

    expect(getTranscriptPageMock).toHaveBeenCalledWith('session-1', { limit: expectedLimit, page: 1 });
  });

  it('rejects invalid limits with 400', async () => {
    await request(app)
      .get(withAuraBasePath('/sessions/session-1/transcript'))
      .query({ limit: 'NaN' })
      .expect(400);

    expect(getTranscriptPageMock).not.toHaveBeenCalled();
  });

  it('rejects non-positive limits with 400', async () => {
    await request(app)
      .get(withAuraBasePath('/sessions/session-1/transcript'))
      .query({ limit: '0' })
      .expect(400);

    expect(getTranscriptPageMock).not.toHaveBeenCalled();
  });

  it('rejects invalid pages with 400', async () => {
    await request(app)
      .get(withAuraBasePath('/sessions/session-1/transcript'))
      .query({ page: 'NaN' })
      .expect(400);

    expect(getTranscriptPageMock).not.toHaveBeenCalled();
  });

  it('rejects non-positive pages with 400', async () => {
    await request(app)
      .get(withAuraBasePath('/sessions/session-1/transcript'))
      .query({ page: '0' })
      .expect(400);

    expect(getTranscriptPageMock).not.toHaveBeenCalled();
  });

  it('returns 400 when no session ID is provided', async () => {
    await request(app)
      .get(withAuraBasePath('/sessions/%20/transcript'))
      .expect(400);

    expect(getTranscriptPageMock).not.toHaveBeenCalled();
  });

  it('maps service errors to 500', async () => {
    getTranscriptPageMock.mockImplementation(() => {
      throw new Error('fetch failed');
    });

    await request(app)
      .get(withAuraBasePath('/sessions/session-1/transcript'))
      .expect(500);
  });
});

describe('transcripts listing route', () => {
  beforeEach(() => {
    getLatestTranscriptsMock.mockReset();
    deleteAllTranscriptsMock.mockReset();
  });

  it('returns transcripts with pagination metadata when the service succeeds', async () => {
    const rows = [
      { id: 2, sessionId: 'session-1', payload: 'hello', metadata: null, receivedAt: '2026-04-01T12:00:00Z', classificationState: 'pending' as const, classificationReason: null }
    ];
    getLatestTranscriptsMock.mockReturnValue({
      transcripts: rows,
      page: 1,
      limit: 25,
      total: rows.length,
      hasMore: false
    });

    const response = await request(app)
      .get(withAuraBasePath('/transcripts'))
      .expect(200);

    expect(response.body).toEqual({
      transcripts: rows.map((row) => ({ ...row, classifications: [] })),
      page: 1,
      limit: 25,
      total: rows.length,
      hasMore: false
    });
    expect(getLatestTranscriptsMock).toHaveBeenCalledWith({ limit: 25, page: 1 });
    expect(classificationMock).toHaveBeenCalledWith([rows[0].id]);
  });

  it('forwards pagination params to the storage helper', async () => {
    getLatestTranscriptsMock.mockReturnValue({
      transcripts: [],
      page: 3,
      limit: 5,
      total: 0,
      hasMore: false
    });

    await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ limit: '5', page: '3' })
      .expect(200);

    expect(getLatestTranscriptsMock).toHaveBeenCalledWith({ limit: 5, page: 3 });
  });

  it('caps limit values at the configured maximum', async () => {
    getLatestTranscriptsMock.mockReturnValue({
      transcripts: [],
      page: 1,
      limit: MAX_TRANSCRIPT_LIMIT,
      total: 0,
      hasMore: false
    });

    await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ limit: `${MAX_TRANSCRIPT_LIMIT + 20}` })
      .expect(200);

    expect(getLatestTranscriptsMock).toHaveBeenCalledWith({ limit: MAX_TRANSCRIPT_LIMIT, page: 1 });
  });

  it('rejects invalid limits with 400', async () => {
    await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ limit: 'NaN' })
      .expect(400);

    expect(getLatestTranscriptsMock).not.toHaveBeenCalled();
  });

  it('rejects invalid pages with 400', async () => {
    await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ page: '0' })
      .expect(400);

    expect(getLatestTranscriptsMock).not.toHaveBeenCalled();
  });

  it('rejects non-numeric page values with 400', async () => {
    await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ page: 'NaN' })
      .expect(400);

    expect(getLatestTranscriptsMock).not.toHaveBeenCalled();
  });

  it('maps service errors to 500', async () => {
    getLatestTranscriptsMock.mockImplementation(() => {
      throw new Error('fetch failed');
    });

    await request(app)
      .get(withAuraBasePath('/transcripts'))
      .expect(500);
  });

  it('filters transcripts by classificationId when provided', async () => {
    const rows = [
      { id: 10, sessionId: 's1', payload: 'filtered', metadata: null, receivedAt: '2026-04-01T12:00:00Z', classificationState: 'pending' as const, classificationReason: null }
    ];
    getTranscriptsByClassificationMock.mockReturnValue({
      transcripts: rows,
      page: 1,
      limit: 25,
      total: 1,
      hasMore: false
    });

    const response = await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ classificationId: 'cat-special' })
      .expect(200);

    expect(response.body.transcripts[0].payload).toBe('filtered');
    expect(getTranscriptsByClassificationMock).toHaveBeenCalledWith('cat-special', { limit: 25, page: 1 });
    expect(getLatestTranscriptsMock).not.toHaveBeenCalled();
  });

  it('filters transcripts by classificationState when provided', async () => {
    const rows = [
      { id: 12, sessionId: 's-state', payload: 'unclassified-only', metadata: null, receivedAt: '2026-04-01T12:00:00Z', classificationState: 'unclassified' as const, classificationReason: null }
    ];
    getTranscriptsByClassificationStateMock.mockReturnValue({
      transcripts: rows,
      page: 1,
      limit: 25,
      total: 1,
      hasMore: false
    });

    const response = await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ classificationState: 'unclassified' })
      .expect(200);

    expect(response.body.transcripts[0].payload).toBe('unclassified-only');
    expect(getTranscriptsByClassificationStateMock).toHaveBeenCalledWith('unclassified', { limit: 25, page: 1 });
    expect(getTranscriptsByClassificationMock).not.toHaveBeenCalled();
    expect(getLatestTranscriptsMock).not.toHaveBeenCalled();
  });

  it('rejects invalid classificationState values', async () => {
    await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ classificationState: 'mystery' })
      .expect(400);

    expect(getTranscriptsByClassificationStateMock).not.toHaveBeenCalled();
    expect(getLatestTranscriptsMock).not.toHaveBeenCalled();
  });

  it('prefers classificationId over classificationState filters', async () => {
    getTranscriptsByClassificationMock.mockReturnValue({
      transcripts: [],
      page: 1,
      limit: 25,
      total: 0,
      hasMore: false
    });

    await request(app)
      .get(withAuraBasePath('/transcripts'))
      .query({ classificationId: 'cat-special', classificationState: 'unclassified' })
      .expect(200);

    expect(getTranscriptsByClassificationMock).toHaveBeenCalled();
    expect(getTranscriptsByClassificationStateMock).not.toHaveBeenCalled();
  });

  it('returns 204 when deleting all transcripts succeeds', async () => {
    deleteAllTranscriptsMock.mockReturnValue(2);

    await request(app)
      .delete(withAuraBasePath('/transcripts'))
      .expect(204);

    expect(deleteAllTranscriptsMock).toHaveBeenCalledTimes(1);
  });

  it('maps delete failures to 500', async () => {
    deleteAllTranscriptsMock.mockImplementation(() => {
      throw new Error('delete failed');
    });

    await request(app)
      .delete(withAuraBasePath('/transcripts'))
      .expect(500);
  });
});

describe('individual transcript deletion', () => {
  beforeEach(() => {
    deleteTranscriptMock.mockReset();
  });

  it('returns 204 when the transcript is deleted successfully', async () => {
    deleteTranscriptMock.mockReturnValue(1);

    await request(app)
      .delete(withAuraBasePath('/transcripts/42'))
      .expect(204);

    expect(deleteTranscriptMock).toHaveBeenCalledWith(42);
  });

  it('returns 400 when the transcript ID is not a number', async () => {
    await request(app)
      .delete(withAuraBasePath('/transcripts/not-a-number'))
      .expect(400);

    expect(deleteTranscriptMock).not.toHaveBeenCalled();
  });

  it('maps delete failures to 500', async () => {
    deleteTranscriptMock.mockImplementation(() => {
      throw new Error('delete failed');
    });

    await request(app)
      .delete(withAuraBasePath('/transcripts/42'))
      .expect(500);
  });
});

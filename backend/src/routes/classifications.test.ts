import '../tests/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/classificationStorage', () => ({
  listClassifications: vi.fn(),
  saveClassification: vi.fn(),
  deleteClassificationById: vi.fn(),
  CLASSIFICATIONS_TABLE_SQL: `
    CREATE TABLE IF NOT EXISTS classifications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );
  `
}));

vi.mock('../services/transcriptClassificationStorage', () => ({
  getClassificationStats: vi.fn(),
  TRANSCRIPT_CLASSIFICATIONS_TABLE_SQL: `
    CREATE TABLE IF NOT EXISTS transcript_classifications (
      transcript_id INTEGER NOT NULL,
      classification_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (transcript_id, classification_id),
      FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE,
      FOREIGN KEY (classification_id) REFERENCES classifications(id) ON DELETE CASCADE
    );
  `
}));

import { createApp } from '../index';
import { withAuraBasePath } from '../config/auraPath';
import {
  listClassifications,
  saveClassification,
  deleteClassificationById
} from '../services/classificationStorage';
import { getClassificationStats } from '../services/transcriptClassificationStorage';

const app = createApp();
const listMock = vi.mocked(listClassifications);
const saveMock = vi.mocked(saveClassification);
const deleteMock = vi.mocked(deleteClassificationById);
const statsMock = vi.mocked(getClassificationStats);

describe('classifications route', () => {
  beforeEach(() => {
    listMock.mockReset();
    saveMock.mockReset();
    deleteMock.mockReset();
    statsMock.mockReset();
  });

  it('returns classification stats', async () => {
    const stats = [{ id: 'cat-1', name: 'First', description: null, count: 5 }];
    statsMock.mockReturnValue(stats);

    await request(app)
      .get(withAuraBasePath('/classifications/stats'))
      .expect(200, stats);
  });

  it('maps stats failures to 500', async () => {
    statsMock.mockImplementation(() => {
      throw new Error('oops');
    });

    await request(app)
      .get(withAuraBasePath('/classifications/stats'))
      .expect(500);
  });

  it('returns classifications list', async () => {
    const rows = [{ id: 'cat-1', name: 'First', description: null }];
    listMock.mockReturnValue(rows);

    await request(app)
      .get(withAuraBasePath('/classifications'))
      .expect(200, rows);
  });

  it('maps list failures to 500', async () => {
    listMock.mockImplementation(() => {
      throw new Error('oops');
    });

    await request(app)
      .get(withAuraBasePath('/classifications'))
      .expect(500);
  });

  it('saves classification when an id is provided and trimmed', async () => {
    const savedRecord = { id: 'cat-1', name: 'First', description: 'desc' };
    saveMock.mockReturnValue(savedRecord);

    const response = await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({ id: '  cat-1  ', name: '  First  ', description: 'desc ' })
      .expect(200);

    expect(response.body).toEqual(savedRecord);
    expect(saveMock).toHaveBeenCalledWith({ id: 'cat-1', name: 'First', description: 'desc' });
  });

  it('creates classification records without supplying an id', async () => {
    const savedRecord = { id: 'high-priority', name: 'High Priority', description: null };
    saveMock.mockReturnValue(savedRecord);

    await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({ name: '  High Priority  ' })
      .expect(200);

    expect(saveMock).toHaveBeenCalledWith({ name: 'High Priority', description: null });
  });

  it('rejects missing name', async () => {
    await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({})
      .expect(400);

    expect(saveMock).not.toHaveBeenCalled();
  });

  it('rejects non-string name values', async () => {
    await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({ name: true })
      .expect(400);

    expect(saveMock).not.toHaveBeenCalled();
  });

  it('maps save failures to 500', async () => {
    saveMock.mockImplementation(() => {
      throw new Error('persist failed');
    });

    await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({ id: 'cat-1', name: 'Name' })
      .expect(500);
  });

  it('deletes classification and returns 204', async () => {
    deleteMock.mockReturnValue(1);

    await request(app)
      .delete(withAuraBasePath('/classifications/cat-1'))
      .expect(204);

    expect(deleteMock).toHaveBeenCalledWith('cat-1');
  });

  it('trims id and rejects missing id', async () => {
    await request(app)
      .delete(withAuraBasePath('/classifications/%20'))
      .expect(400);

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('maps delete failures to 500', async () => {
    deleteMock.mockImplementation(() => {
      throw new Error('boom');
    });

    await request(app)
      .delete(withAuraBasePath('/classifications/cat-1'))
      .expect(500);
  });

  it('maps malformed JSON payload to 400', async () => {
    await request(app)
      .post(withAuraBasePath('/classifications'))
      .set('Content-Type', 'application/json')
      .send('{"id": "cat-1" invalid}')
      .expect(400);

    expect(saveMock).not.toHaveBeenCalled();
  });
});

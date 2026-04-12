import '../tests/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/classificationStorage', () => ({
  listClassifications: vi.fn(),
  saveClassification: vi.fn(),
  deleteClassificationById: vi.fn()
}));

import { createApp } from '../index';
import { withAuraBasePath } from '../config/auraPath';
import {
  listClassifications,
  saveClassification,
  deleteClassificationById
} from '../services/classificationStorage';

const app = createApp();
const listMock = vi.mocked(listClassifications);
const saveMock = vi.mocked(saveClassification);
const deleteMock = vi.mocked(deleteClassificationById);

describe('classifications route', () => {
  beforeEach(() => {
    listMock.mockReset();
    saveMock.mockReset();
    deleteMock.mockReset();
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

  it('saves classification from body and returns 200', async () => {
    const savedRecord = { id: 'cat-1', name: 'First', description: 'desc' };
    saveMock.mockReturnValue(savedRecord);

    const response = await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({ id: '  cat-1  ', name: '  First  ', description: 'desc ' })
      .expect(200);

    expect(response.body).toEqual(savedRecord);
    expect(saveMock).toHaveBeenCalledWith({ id: 'cat-1', name: 'First', description: 'desc' });
  });

  it('rejects missing required fields', async () => {
    await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({ name: 'Name only' })
      .expect(400);

    await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({ id: 'cat-1' })
      .expect(400);

    expect(saveMock).not.toHaveBeenCalled();
  });

  it('rejects non-string or non-buffer id/name values', async () => {
    await request(app)
      .post(withAuraBasePath('/classifications'))
      .send({ id: { nested: 'value' }, name: true })
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

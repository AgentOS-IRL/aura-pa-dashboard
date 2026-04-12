import '../tests/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/classificationStorage', () => ({
  getClassificationById: vi.fn()
}));
vi.mock('../services/transcriptClassificationStorage', () => ({
  assignClassificationToTranscript: vi.fn(),
  getClassificationsForTranscripts: vi.fn(),
  removeClassificationFromTranscript: vi.fn()
}));

import { createApp } from '../index';
import { withAuraBasePath } from '../config/auraPath';
import { getClassificationById } from '../services/classificationStorage';
import {
  assignClassificationToTranscript,
  getClassificationsForTranscripts,
  removeClassificationFromTranscript
} from '../services/transcriptClassificationStorage';

const app = createApp();
const classificationMock = vi.mocked(getClassificationsForTranscripts);
const assignMock = vi.mocked(assignClassificationToTranscript);
const removeMock = vi.mocked(removeClassificationFromTranscript);
const classificationRecordMock = vi.mocked(getClassificationById);

beforeEach(() => {
  classificationMock.mockReset();
  classificationMock.mockReturnValue(new Map());
  assignMock.mockReset();
  removeMock.mockReset();
  classificationRecordMock.mockReset();
});

describe('transcript classifications route', () => {
  it('returns assignments for a transcript', async () => {
    const assignments = [
      {
        transcriptId: 5,
        classificationId: 'cat-one',
        name: 'First',
        description: 'desc',
        assignedAt: '2026-04-01T12:00:00Z'
      }
    ];
    classificationMock.mockReturnValueOnce(new Map([[5, assignments]]));

    await request(app)
      .get(withAuraBasePath('/transcripts/5/classifications'))
      .expect(200, assignments);
  });

  it('rejects missing transcript ids', async () => {
    await request(app).get(withAuraBasePath('/transcripts/%20/classifications')).expect(400);
    expect(classificationMock).not.toHaveBeenCalled();
  });

  it('attaches a classification and returns the updated list', async () => {
    const assignment = {
      transcriptId: 7,
      classificationId: 'cat-one',
      name: 'First',
      description: 'desc',
      assignedAt: '2026-04-02T12:00:00Z'
    };
    const classification = { id: 'cat-one', name: 'First', description: 'desc' };
    classificationRecordMock.mockReturnValueOnce(classification);
    assignMock.mockReturnValueOnce(assignment);
    classificationMock.mockReturnValueOnce(new Map([[7, [assignment]]]));

    const response = await request(app)
      .post(withAuraBasePath('/transcripts/7/classifications'))
      .send({ id: 'cat-one' })
      .expect(200);

    expect(assignMock).toHaveBeenCalledWith(7, 'cat-one');
    expect(response.body).toEqual([assignment]);
  });

  it('rejects missing classification ids', async () => {
    await request(app)
      .post(withAuraBasePath('/transcripts/3/classifications'))
      .send({})
      .expect(400);

    expect(assignMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the classification is absent', async () => {
    classificationRecordMock.mockReturnValueOnce(null);

    await request(app)
      .post(withAuraBasePath('/transcripts/3/classifications'))
      .send({ id: 'missing' })
      .expect(404);

    expect(assignMock).not.toHaveBeenCalled();
  });

  it('removes a classification assignment', async () => {
    removeMock.mockReturnValueOnce(1);

    await request(app)
      .delete(withAuraBasePath('/transcripts/4/classifications/cat-one'))
      .expect(204);

    expect(removeMock).toHaveBeenCalledWith(4, 'cat-one');
  });

  it('rejects invalid classification ids for deletion', async () => {
    await request(app)
      .delete(withAuraBasePath('/transcripts/4/classifications/%20'))
      .expect(400);

    expect(removeMock).not.toHaveBeenCalled();
  });
});

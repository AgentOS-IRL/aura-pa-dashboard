import { Router, Request, Response } from 'express';
import { getClassificationById } from '../services/classificationStorage';
import { doesTranscriptExist } from '../services/transcriptStorage';
import {
  assignClassificationToTranscript,
  getClassificationsForTranscripts,
  removeClassificationFromTranscript
} from '../services/transcriptClassificationStorage';
import { parseTranscriptId } from '../utils/transcriptId';

const router = Router();

function parseClassificationId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

router.get('/:transcriptId/classifications', (req: Request<{ transcriptId: string }>, res: Response) => {
  const transcriptId = parseTranscriptId(req.params.transcriptId);
  if (transcriptId === null) {
    return res.status(400).json({ error: 'transcriptId path parameter is required and must be a positive integer' });
  }

  try {
    const assignments = getClassificationsForTranscripts([transcriptId]).get(transcriptId) ?? [];
    return res.status(200).json(assignments);
  } catch (error) {
    console.error('Unable to list transcript classifications', transcriptId, error);
    return res.status(500).json({ error: 'Unable to list transcript classifications' });
  }
});

router.post('/:transcriptId/classifications', (req: Request<{ transcriptId: string }, unknown, { id?: unknown }>, res: Response) => {
  const transcriptId = parseTranscriptId(req.params.transcriptId);
  if (transcriptId === null) {
    return res.status(400).json({ error: 'transcriptId path parameter is required and must be a positive integer' });
  }

  const classificationId = parseClassificationId(req.body?.id);
  if (classificationId === null) {
    return res.status(400).json({ error: 'classification id is required' });
  }

  const classification = getClassificationById(classificationId);
  if (!classification) {
    return res.status(404).json({ error: 'classification not found' });
  }

  if (!doesTranscriptExist(transcriptId)) {
    return res.status(404).json({ error: 'transcript not found' });
  }

  try {
    assignClassificationToTranscript(transcriptId, classificationId);
    const assignments = getClassificationsForTranscripts([transcriptId]).get(transcriptId) ?? [];
    return res.status(200).json(assignments);
  } catch (error) {
    if (!doesTranscriptExist(transcriptId)) {
      return res.status(404).json({ error: 'transcript not found' });
    }

    console.error('Unable to assign classification to transcript', transcriptId, classificationId, error);
    return res.status(500).json({ error: 'Unable to assign classification to transcript' });
  }
});

router.delete(
  '/:transcriptId/classifications/:classificationId',
  (req: Request<{ transcriptId: string; classificationId: string }>, res: Response) => {
    const transcriptId = parseTranscriptId(req.params.transcriptId);
    if (transcriptId === null) {
      return res.status(400).json({ error: 'transcriptId path parameter is required and must be a positive integer' });
    }

    const classificationId = parseClassificationId(req.params.classificationId);
    if (classificationId === null) {
      return res.status(400).json({ error: 'classificationId path parameter is required' });
    }

    try {
      removeClassificationFromTranscript(transcriptId, classificationId);
      return res.status(204).send();
    } catch (error) {
      console.error('Unable to remove transcript classification', transcriptId, classificationId, error);
      return res.status(500).json({ error: 'Unable to remove transcript classification' });
    }
  }
);

export default router;

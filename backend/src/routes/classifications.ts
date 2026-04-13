import { Router, Request, Response } from 'express';
import {
  deleteClassificationById,
  listClassifications,
  saveClassification,
  type SaveClassificationInput
} from '../services/classificationStorage';
import { getClassificationStats } from '../services/transcriptClassificationStorage';

const router = Router();

const isStringOrBuffer = (value: unknown): value is string | Buffer =>
  typeof value === 'string' || Buffer.isBuffer(value);

const normalizeStringInput = (value: string | Buffer): string =>
  Buffer.isBuffer(value) ? value.toString('utf8') : value;

const ensureRequiredField = (value: unknown): string | null => {
  if (!isStringOrBuffer(value)) {
    return null;
  }

  const normalized = normalizeStringInput(value).trim();
  if (!normalized) {
    return null;
  }

  return normalized;
};

const normalizeOptionalString = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isStringOrBuffer(value)) {
    return null;
  }

  const normalized = normalizeStringInput(value).trim();
  return normalized || null;
};

router.get('/', (_req: Request, res: Response) => {
  try {
    const classifications = listClassifications();
    return res.status(200).json(classifications);
  } catch (error) {
    console.error('Unable to list classifications', error);
    return res.status(500).json({ error: 'Unable to list classifications' });
  }
});

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getClassificationStats();
    return res.status(200).json(stats);
  } catch (error) {
    console.error('Unable to get classification stats', error);
    return res.status(500).json({ error: 'Unable to get classification stats' });
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const name = ensureRequiredField(body.name);

  if (name === null) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const description = normalizeOptionalString(body.description);
    const id = normalizeOptionalString(body.id);
    const payload: SaveClassificationInput = {
      name,
      description
    };
    if (id !== null) {
      payload.id = id;
    }

    const saved = saveClassification(payload);
    return res.status(200).json(saved);
  } catch (error) {
    console.error('Unable to save classification', error);
    return res.status(500).json({ error: 'Unable to save classification' });
  }
});

router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
  const normalizedId = normalizeStringInput(req.params.id).trim();
  if (!normalizedId) {
    return res.status(400).json({ error: 'id is required' });
  }

  try {
    deleteClassificationById(normalizedId);
    return res.status(204).send();
  } catch (error) {
    console.error('Unable to delete classification', error);
    return res.status(500).json({ error: 'Unable to delete classification' });
  }
});

export default router;

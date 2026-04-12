import { Router, Request, Response } from 'express';
import {
  deleteClassificationById,
  listClassifications,
  saveClassification
} from '../services/classificationStorage';

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

const normalizeDescription = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isStringOrBuffer(value)) {
    return null;
  }

  const normalized = normalizeStringInput(value).trim();
  if (!normalized) {
    return null;
  }

  return normalized;
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

router.post('/', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const id = ensureRequiredField(body.id);
  const name = ensureRequiredField(body.name);

  if (id === null || name === null) {
    const missing = [];
    if (id === null) missing.push('id');
    if (name === null) missing.push('name');
    const verb = missing.length > 1 ? 'are' : 'is';
    return res.status(400).json({ error: `${missing.join(' and ')} ${verb} required` });
  }

  try {
    const description = normalizeDescription(body.description);
    const saved = saveClassification({ id, name, description });
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

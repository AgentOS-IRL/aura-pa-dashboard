import { Router, Request, Response } from 'express';
import multer from 'multer';
import { transcribeAndSaveAudio } from '../services/audio';
import { getAgentHealthEntry, isHealthyStatusValue } from '../services/agentHealth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface AudioUploadRequest extends Request {
  file?: Express.Multer.File;
}

const EXECUTOR_HEADER = 'x-aura-executor-id';
const EXECUTOR_QUERY_PARAM = 'executorId';

function resolveExecutorId(req: Request): string {
  const headerValue = req.header(EXECUTOR_HEADER);
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }

  const paramValue = req.query[EXECUTOR_QUERY_PARAM];
  if (typeof paramValue === 'string' && paramValue.trim()) {
    return paramValue.trim();
  }

  if (Array.isArray(paramValue)) {
    const first = paramValue.find((value) => typeof value === 'string' && value.trim());
    if (first) {
      return first.trim();
    }
  }

  return '';
}

router.post('/:sessionId/audio', upload.single('audio'), async (req: AudioUploadRequest, res: Response) => {
  const sessionId = (typeof req.params.sessionId === 'string' ? req.params.sessionId : '')?.trim();

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId path parameter is required' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'audio file is required' });
  }

  const executorId = resolveExecutorId(req);
  if (!executorId) {
    return res.status(400).json({ error: 'executor identifier header or query parameter is required' });
  }

  const healthEntry = getAgentHealthEntry(executorId);
  if (!healthEntry || !isHealthyStatusValue(healthEntry.health)) {
    console.warn('Executor %s is not healthy for audio uploads', executorId, healthEntry?.health);
    return res.status(409).json({ error: 'Executor is not healthy' });
  }

  try {
    // Multer keeps the blob in memory so we never persist sensitive bytes on disk before transcribing.
    await transcribeAndSaveAudio(sessionId, req.file.buffer);
    return res.sendStatus(201);
  } catch (error) {
    console.error('Failed to transcribe audio upload for session', sessionId, error);
    return res.status(500).json({ error: 'Unable to transcribe audio upload' });
  }
});

export default router;

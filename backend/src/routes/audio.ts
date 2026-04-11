import { Router, Request, Response } from 'express';
import multer from 'multer';
import { recordAudioChunk } from '../services/audio';
import { getAgentHealthEntry, isHealthyStatusValue } from '../services/agentHealth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface AudioUploadRequest extends Request {
  file?: Express.Multer.File;
}

const EXECUTOR_ID_HEADER = 'x-aura-executor-id';
const EXECUTOR_ID_QUERY = 'executorId';

function parseStringValue(value: string | string[] | undefined) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return undefined;
}

function resolveExecutorId(req: Request) {
  const headerValue = parseStringValue(req.get(EXECUTOR_ID_HEADER));
  const headerTrimmed = headerValue?.trim();
  if (headerTrimmed) {
    return headerTrimmed;
  }

  const queryValue = parseStringValue(req.query[EXECUTOR_ID_QUERY] as string | string[]);
  return queryValue?.trim();
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
    return res.status(400).json({
      error: 'executorId query parameter or x-aura-executor-id header is required for audio uploads'
    });
  }

  const executorHealth = getAgentHealthEntry(executorId);
  if (!executorHealth) {
    console.warn(
      `[audio] executor ${executorId} has no recorded health data; skipping chunk persistence for session ${sessionId}`
    );
    return res.status(409).json({ error: 'Executor health is unavailable at the moment' });
  }

  if (!isHealthyStatusValue(executorHealth.health)) {
    console.warn(
      `[audio] executor ${executorId} reported unhealthy status (${executorHealth.health}); skipping chunk persistence for session ${sessionId}`
    );
    return res.status(409).json({ error: 'Executor is not healthy enough to accept audio chunks' });
  }

  try {
    // Multer stores the blob in memory right next to this route so we never persist sensitive bytes on disk.
    await recordAudioChunk(sessionId, req.file.buffer);
    // Always append to agentos/aura/audio/<sessionId> to keep chunks grouped and to rely on the shared TTL cleanup.
    return res.sendStatus(201);
  } catch (error) {
    console.error('Failed to persist audio chunk for session', sessionId, error);
    return res.status(500).json({ error: 'Unable to save audio chunk' });
  }
});

export default router;

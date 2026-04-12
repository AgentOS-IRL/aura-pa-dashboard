import { Router, Request, Response } from 'express';
import { getTranscriptPage, saveTranscript } from '../services/transcriptStorage';
import { normalizeLimitParam, normalizePageParam } from './pagination';
import { attachTranscriptClassifications } from './transcriptPageHelpers';

const router = Router();

export { MAX_TRANSCRIPT_LIMIT } from './pagination';

interface TranscriptRequestBody {
  payload?: unknown;
  metadata?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

router.post('/:sessionId/transcript', (req: Request<{ sessionId: string }, unknown, TranscriptRequestBody>, res: Response) => {
  const sessionId = (typeof req.params.sessionId === 'string' ? req.params.sessionId.trim() : '');
  const { payload, metadata } = req.body ?? {};

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId path parameter is required' });
  }

  if (payload === undefined || payload === null) {
    return res.status(400).json({ error: 'payload is required' });
  }

  if (metadata !== undefined && metadata !== null && !isRecord(metadata)) {
    return res.status(400).json({ error: 'metadata must be an object when provided' });
  }

  if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
    return res.status(400).json({ error: 'payload must be a string' });
  }

  const normalizedPayload = Buffer.isBuffer(payload) ? payload.toString('utf-8') : payload;

  const normalizedMetadata = isRecord(metadata) ? metadata : undefined;

  try {
    saveTranscript(sessionId, normalizedPayload, normalizedMetadata);
    return res.sendStatus(201);
  } catch (error) {
    console.error('Unable to persist transcript for session', sessionId, error);
    return res.status(500).json({ error: 'Unable to persist transcript' });
  }
});

router.get(
  '/:sessionId/transcript',
  (
    req: Request<{ sessionId: string }, unknown, unknown, { limit?: string | string[]; page?: string | string[] }>,
    res: Response
  ) => {
    const sessionId = (typeof req.params.sessionId === 'string' ? req.params.sessionId.trim() : '');

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId path parameter is required' });
    }

    const limitResult = normalizeLimitParam(req.query.limit);
    if (limitResult.error) {
      return res.status(400).json({ error: limitResult.error });
    }

    const pageResult = normalizePageParam(req.query.page);
    if (pageResult.error) {
      return res.status(400).json({ error: pageResult.error });
    }

    try {
      const transcriptPage = attachTranscriptClassifications(
        getTranscriptPage(sessionId, {
          limit: limitResult.limit,
          page: pageResult.page
        })
      );
      return res.status(200).json(transcriptPage);
    } catch (error) {
      console.error('Unable to fetch transcripts for session', sessionId, error);
      return res.status(500).json({ error: 'Unable to fetch transcripts' });
    }
  }
);

export default router;

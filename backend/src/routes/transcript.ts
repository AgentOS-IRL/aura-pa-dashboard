import { Router, Request, Response } from 'express';
import { getTranscriptPage, saveTranscript } from '../services/transcriptStorage';

const router = Router();

export const MAX_TRANSCRIPT_LIMIT = 100;
const DEFAULT_TRANSCRIPT_LIMIT = 25;
const DEFAULT_TRANSCRIPT_PAGE = 1;

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
    req: Request<{ sessionId: string }, unknown, unknown, { limit?: string; page?: string }>,
    res: Response
  ) => {
    const sessionId = (typeof req.params.sessionId === 'string' ? req.params.sessionId.trim() : '');
    const limitParam = req.query.limit;
    const pageParam = req.query.page;
    let normalizedLimit = DEFAULT_TRANSCRIPT_LIMIT;
    let normalizedPage = DEFAULT_TRANSCRIPT_PAGE;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId path parameter is required' });
    }

    if (limitParam !== undefined) {
      const limitString = typeof limitParam === 'string' ? limitParam.trim() : '';
      if (!limitString || !/^[0-9]+$/.test(limitString)) {
        return res.status(400).json({ error: 'limit must be a positive integer' });
      }

      const parsed = Number.parseInt(limitString, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'limit must be a positive integer' });
      }

      normalizedLimit = Math.min(parsed, MAX_TRANSCRIPT_LIMIT);
    }

    if (pageParam !== undefined) {
      const pageString = typeof pageParam === 'string' ? pageParam.trim() : '';
      if (!pageString || !/^[0-9]+$/.test(pageString)) {
        return res.status(400).json({ error: 'page must be a positive integer' });
      }

      const parsed = Number.parseInt(pageString, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'page must be a positive integer' });
      }

      normalizedPage = parsed;
    }

    try {
      const transcriptPage = getTranscriptPage(sessionId, {
        limit: normalizedLimit,
        page: normalizedPage
      });
      return res.status(200).json(transcriptPage);
    } catch (error) {
      console.error('Unable to fetch transcripts for session', sessionId, error);
      return res.status(500).json({ error: 'Unable to fetch transcripts' });
    }
  }
);

export default router;

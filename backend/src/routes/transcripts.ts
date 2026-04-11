import { Router, Request, Response } from 'express';
import { getLatestTranscripts } from '../services/transcriptStorage';
import { normalizeLimitParam, normalizePageParam } from './pagination';

const router = Router();

router.get(
  '/',
  (
    req: Request<unknown, unknown, unknown, { limit?: string; page?: string }>,
    res: Response
  ) => {
    const limitResult = normalizeLimitParam(req.query.limit);
    if (limitResult.error) {
      return res.status(400).json({ error: limitResult.error });
    }

    const pageResult = normalizePageParam(req.query.page);
    if (pageResult.error) {
      return res.status(400).json({ error: pageResult.error });
    }

    try {
      const transcriptPage = getLatestTranscripts({
        limit: limitResult.limit,
        page: pageResult.page
      });

      return res.status(200).json(transcriptPage);
    } catch (error) {
      console.error('Unable to fetch transcripts', error);
      return res.status(500).json({ error: 'Unable to fetch transcripts' });
    }
  }
);

export default router;

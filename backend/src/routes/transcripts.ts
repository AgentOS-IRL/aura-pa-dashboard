import { Router, Request, Response } from 'express';
import { deleteAllTranscripts, getLatestTranscripts } from '../services/transcriptStorage';
import { normalizeLimitParam, normalizePageParam } from './pagination';
import { attachTranscriptClassifications } from './transcriptPageHelpers';

const router = Router();

router.get(
  '/',
  (
    req: Request<unknown, unknown, unknown, { limit?: string | string[]; page?: string | string[] }>,
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
      const transcriptPage = attachTranscriptClassifications(
        getLatestTranscripts({
          limit: limitResult.limit,
          page: pageResult.page
        })
      );

      return res.status(200).json(transcriptPage);
    } catch (error) {
      console.error('Unable to fetch transcripts', error);
      return res.status(500).json({ error: 'Unable to fetch transcripts' });
    }
  }
);

router.delete('/', (_req, res) => {
  try {
    deleteAllTranscripts();
    return res.status(204).send();
  } catch (error) {
    console.error('Unable to delete transcripts', error);
    return res.status(500).json({ error: 'Unable to delete transcripts' });
  }
});

export default router;

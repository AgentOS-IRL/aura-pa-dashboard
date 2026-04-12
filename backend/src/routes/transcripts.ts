import { Router, Request, Response } from 'express';
import { deleteAllTranscripts, getLatestTranscripts, getTranscriptsByClassification } from '../services/transcriptStorage';
import { normalizeLimitParam, normalizePageParam } from './pagination';
import { attachTranscriptClassifications } from './transcriptPageHelpers';

const router = Router();

router.get(
  '/',
  (
    req: Request<unknown, unknown, unknown, { limit?: string | string[]; page?: string | string[]; classificationId?: string | string[] }>,
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

    const classificationId = Array.isArray(req.query.classificationId)
      ? req.query.classificationId[0]
      : req.query.classificationId;

    try {
      const options = {
        limit: limitResult.limit,
        page: pageResult.page
      };

      const result = classificationId
        ? getTranscriptsByClassification(classificationId, options)
        : getLatestTranscripts(options);

      const transcriptPage = attachTranscriptClassifications(result);

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

import { Router, Request, Response } from 'express';
import {
  deleteAllTranscripts,
  deleteTranscript,
  getLatestTranscripts,
  getTranscriptsByClassification,
  getTranscriptsByClassificationState,
  getTranscriptsWithoutClassifications,
  getTranscriptById,
  TranscriptClassificationState,
  VALID_TRANSCRIPT_CLASSIFICATION_STATES
} from '../services/transcriptStorage';
import { normalizeLimitParam, normalizePageParam } from './pagination';
import { attachTranscriptClassifications } from './transcriptPageHelpers';
import { classifyTranscriptWithCodex } from '../services/transcriptClassificationWorker';
import { serializeError } from './errorUtils';

const router = Router();

router.get(
  '/',
  (
    req: Request<
      unknown,
      unknown,
      unknown,
      {
        limit?: string | string[];
        page?: string | string[];
        classificationId?: string | string[];
        classificationState?: string | string[];
        unclassifiedOnly?: string | string[];
      }
    >,
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
    const classificationStateParam = Array.isArray(req.query.classificationState)
      ? req.query.classificationState[0]
      : req.query.classificationState;
    const unclassifiedOnlyParam = Array.isArray(req.query.unclassifiedOnly)
      ? req.query.unclassifiedOnly[0]
      : req.query.unclassifiedOnly;

    let classificationState: TranscriptClassificationState | undefined;

    if (classificationStateParam) {
      if (!VALID_TRANSCRIPT_CLASSIFICATION_STATES.includes(classificationStateParam as TranscriptClassificationState)) {
        return res.status(400).json({ error: 'Invalid classificationState value' });
      }
      classificationState = classificationStateParam as TranscriptClassificationState;
    }

    let unclassifiedOnly: boolean | undefined;
    if (unclassifiedOnlyParam !== undefined) {
      const normalizedValue = String(unclassifiedOnlyParam).trim().toLowerCase();
      if (normalizedValue === 'true' || normalizedValue === '1') {
        unclassifiedOnly = true;
      } else if (normalizedValue === 'false' || normalizedValue === '0') {
        unclassifiedOnly = false;
      } else {
        return res.status(400).json({ error: 'Invalid unclassifiedOnly value' });
      }
    }

    try {
      const options = {
        limit: limitResult.limit,
        page: pageResult.page
      };

      const result = classificationId
        ? getTranscriptsByClassification(classificationId, options)
        : classificationState
          ? getTranscriptsByClassificationState(classificationState, options)
          : unclassifiedOnly
            ? getTranscriptsWithoutClassifications(options)
            : getLatestTranscripts(options);

      const transcriptPage = attachTranscriptClassifications(result);

      return res.status(200).json(transcriptPage);
    } catch (error) {
      console.error('Unable to fetch transcripts', error);
      return res.status(500).json({
        error: 'Unable to fetch transcripts',
        details: serializeError(error)
      });
    }
  }
);

router.delete('/', (_req, res) => {
  try {
    deleteAllTranscripts();
    return res.status(204).send();
  } catch (error) {
    console.error('Unable to delete transcripts', error);
    return res.status(500).json({
      error: 'Unable to delete transcripts',
      details: serializeError(error)
    });
  }
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid transcript ID' });
  }

  try {
    const transcriptId = parseInt(id, 10);
    if (transcriptId <= 0) {
      return res.status(400).json({ error: 'Invalid transcript ID' });
    }
    deleteTranscript(transcriptId);
    return res.status(204).send();
  } catch (error) {
    console.error('Unable to delete transcript', error);
    return res.status(500).json({
      error: 'Unable to delete transcript',
      details: serializeError(error)
    });
  }
});

router.post('/:id/classify', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid transcript ID' });
  }

  const transcriptId = parseInt(id, 10);
  if (transcriptId <= 0) {
    return res.status(400).json({ error: 'Invalid transcript ID' });
  }

  try {
    const record = getTranscriptById(transcriptId);
    if (!record) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    await classifyTranscriptWithCodex(record);
    return res.status(204).send();
  } catch (error) {
    console.error('Unable to classify transcript', transcriptId, error);
    return res.status(500).json({
      error: 'Unable to classify transcript',
      details: serializeError(error)
    });
  }
});

export default router;

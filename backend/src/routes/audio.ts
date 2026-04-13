import { Router, Request, Response } from 'express';
import multer from 'multer';
import { transcribeAndSaveAudio } from '../services/audio';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface AudioUploadRequest extends Request {
  file?: Express.Multer.File;
}

router.post('/:sessionId/audio', upload.single('audio'), async (req: AudioUploadRequest, res: Response) => {
  const sessionId = (typeof req.params.sessionId === 'string' ? req.params.sessionId : '')?.trim();

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId path parameter is required' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'audio file is required' });
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

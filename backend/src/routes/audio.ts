import { Router, Request, Response } from 'express';
import multer from 'multer';
import { recordAudioChunk } from '../services/audio';

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

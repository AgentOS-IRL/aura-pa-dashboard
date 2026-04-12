import { Router, Request, Response } from 'express';
import { CodexClient } from '../services/codexClient';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const client = new CodexClient();
    const usage = await client.fetchUsage();
    return res.status(200).json(usage);
  } catch (error) {
    console.error('Unable to fetch Codex usage', error);
    return res.status(502).json({ error: `Unable to fetch Codex usage ${error}` });
  }
});

export default router;

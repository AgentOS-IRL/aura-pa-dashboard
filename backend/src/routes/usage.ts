import { Router, Request, Response } from 'express';
import { OpenAIClient } from '../services/openaiClient';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const client = new OpenAIClient();
    const usage = await client.fetchUsage();
    return res.status(200).json(usage);
  } catch (error) {
    console.error('Unable to fetch OpenAI usage', error);
    return res.status(502).json({ error: `Unable to fetch OpenAI usage ${error}` });
  }
});

export default router;

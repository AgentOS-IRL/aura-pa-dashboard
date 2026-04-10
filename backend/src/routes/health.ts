import { Router } from 'express';
import pkg from '../../package.json';

const router = Router();

router.get('/', (_, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    version: pkg.version,
    timestamp: new Date().toISOString()
  });
});

export default router;

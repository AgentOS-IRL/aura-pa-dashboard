import { Router } from 'express';
import { AgentHealthSnapshotEntry, getAgentHealthSnapshot } from '../services/agentHealth';
import pkg from '../../package.json';

const router = Router();

router.get('/', (_, res) => {
  const agentHealth = getAgentHealthSnapshot();
  
  const payload: Record<string, unknown> = {
    status: 'ok',
    uptime: process.uptime(),
    version: pkg.version,
    timestamp: new Date().toISOString()
  };

  if (agentHealth && agentHealth.length > 0) {
    payload.agentHealth = agentHealth;
  }

  res.status(200).json(payload);
});

export default router;

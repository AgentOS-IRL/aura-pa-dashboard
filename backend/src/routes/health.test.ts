import '../tests/setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mockGetAgentHealthSnapshot = vi.fn();

vi.mock('../services/agentHealth', () => ({
  getAgentHealthSnapshot: () => mockGetAgentHealthSnapshot()
}));

import { createApp } from '../index';

describe('health route', () => {
  afterEach(() => {
    mockGetAgentHealthSnapshot.mockReset();
  });

  it('includes agentHealth when snapshots exist', async () => {
    mockGetAgentHealthSnapshot.mockReturnValue([
      { id: 'task-a', health: 'ok', lastChecked: '2026-04-10T00:00:00.000Z', label: 'Agent A' }
    ]);

    const app = createApp();
    const response = await request(app).get('/aura/health');

    expect(response.status).toBe(200);
    expect(response.body.agentHealth).toHaveLength(1);
    expect(response.body.agentHealth[0]).toMatchObject({ id: 'task-a', label: 'Agent A' });
  });

  it('does not return agentHealth when no snapshots are stored', async () => {
    mockGetAgentHealthSnapshot.mockReturnValue([]);

    const app = createApp();
    const response = await request(app).get('/aura/health');

    expect(response.status).toBe(200);
    expect(response.body.agentHealth).toBeUndefined();
  });
});

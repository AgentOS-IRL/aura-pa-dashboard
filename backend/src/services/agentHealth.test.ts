import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAgentHealthSnapshot,
  getAgentHealthSnapshot,
  processAgentStatusMessage
} from './agentHealth';

describe('agentHealth service', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    clearAgentHealthSnapshot();
    warnSpy.mockReset();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it('stores a sanitized payload with normalized health and timestamp', () => {
    processAgentStatusMessage(
      JSON.stringify({ taskId: 'task-1', health: 'GREEN', timestamp: '2026-04-10T12:34:56Z', label: 'Example' })
    );

    expect(getAgentHealthSnapshot()).toEqual([
      {
        id: 'task-1',
        health: 'green',
        label: 'Example',
        lastChecked: '2026-04-10T12:34:56.000Z'
      }
    ]);
  });

  it('ignores invalid JSON and missing keys without throwing', () => {
    processAgentStatusMessage('not json');
    processAgentStatusMessage(JSON.stringify({ health: 'ok' }));

    expect(getAgentHealthSnapshot()).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('keeps the latest timestamp and drops older updates for the same key', () => {
    processAgentStatusMessage(
      JSON.stringify({ taskId: 'task-2', health: 'UP', timestamp: '2026-04-10T00:00:00Z' })
    );

    processAgentStatusMessage(
      JSON.stringify({ taskId: 'task-2', health: 'DOWN', timestamp: '2026-04-10T00:02:00Z' })
    );

    processAgentStatusMessage(
      JSON.stringify({ taskId: 'task-2', health: 'CRITICAL', timestamp: '2026-04-10T00:01:00Z' })
    );

    expect(getAgentHealthSnapshot()).toEqual([
      {
        id: 'task-2',
        health: 'down',
        lastChecked: '2026-04-10T00:02:00.000Z'
      }
    ]);
  });
});

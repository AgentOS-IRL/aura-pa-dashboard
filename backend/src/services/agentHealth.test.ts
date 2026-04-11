import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAgentHealthSnapshot,
  getAgentHealthEntry,
  getAgentHealthSnapshot,
  isExecutorHealthy,
  isHealthyStatusValue,
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

  describe('helper utilities', () => {
    it('resolves entries by id and normalizes health strings', () => {
      processAgentStatusMessage(
        JSON.stringify({
          taskId: 'task-x',
          health: ' GREEN ',
          label: 'Helper',
          timestamp: '2026-04-12T01:02:03Z'
        })
      );

      const entry = getAgentHealthEntry('task-x');
      expect(entry).toEqual({
        id: 'task-x',
        health: 'green',
        label: 'Helper',
        lastChecked: '2026-04-12T01:02:03.000Z'
      });
    });

    it('returns undefined for unknown or invalid ids', () => {
      expect(getAgentHealthEntry('missing')).toBeUndefined();
      expect(getAgentHealthEntry('   ')).toBeUndefined();
    });

    it('classifies healthy telemetry consistently', () => {
      processAgentStatusMessage(JSON.stringify({ taskId: 'task-healthy', health: 'UP' }));
      processAgentStatusMessage(JSON.stringify({ taskId: 'task-unhealthy', health: 'DOWN' }));

      expect(isExecutorHealthy('task-healthy')).toBe(true);
      expect(isExecutorHealthy('task-unhealthy')).toBe(false);
      expect(isHealthyStatusValue('GREEN')).toBe(true);
      expect(isHealthyStatusValue('crItical')).toBe(false);
    });
  });
});

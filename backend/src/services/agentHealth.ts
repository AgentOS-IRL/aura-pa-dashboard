import type { Redis } from 'ioredis';
import { redisClient } from '../config/redis';

const AGENT_STATUS_CHANNEL = 'agentos/status';
const DEFAULT_HEALTH = 'unknown';

type RawAgentStatusPayload = {
  taskId?: string;
  label?: string;
  agentName?: string;
  health?: string;
  timestamp?: string;
};

export type AgentHealthSnapshotEntry = {
  id: string;
  health: string;
  lastChecked: string;
  label?: string;
};

const agentHealthStore = new Map<string, AgentHealthSnapshotEntry>();
let agentHealthSubscriber: Redis | null = null;
let subscriberActive = false;

function normalizeStringField(value?: string) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function normalizeHealthValue(health?: string) {
  if (typeof health !== 'string') {
    return DEFAULT_HEALTH;
  }

  const trimmed = health.trim().toLowerCase();
  return trimmed === '' ? DEFAULT_HEALTH : trimmed;
}

function normalizeTimestamp(timestamp?: string) {
  const resolvedDate = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(resolvedDate.getTime())) {
    return new Date().toISOString();
  }
  return resolvedDate.toISOString();
}

function deriveKey(payload: RawAgentStatusPayload) {
  return (
    normalizeStringField(payload.taskId) ??
    normalizeStringField(payload.label) ??
    normalizeStringField(payload.agentName)
  );
}

export function clearAgentHealthSnapshot() {
  agentHealthStore.clear();
}

export function getAgentHealthSnapshot(): AgentHealthSnapshotEntry[] {
  return Array.from(agentHealthStore.values());
}

const HEALTHY_STATUSES = new Set(['health', 'healthy', 'green', 'up', 'ok']);

export function getAgentHealthEntry(id?: string): AgentHealthSnapshotEntry | undefined {
  const authenticatedId = normalizeStringField(id);
  if (!authenticatedId) {
    return undefined;
  }

  const entry = agentHealthStore.get(authenticatedId);
  if (!entry) {
    return undefined;
  }

  return {
    ...entry,
    health: normalizeHealthValue(entry.health)
  };
}

export function isHealthyStatusValue(health?: string) {
  return HEALTHY_STATUSES.has(normalizeHealthValue(health));
}

export function isExecutorHealthy(id?: string) {
  const entry = getAgentHealthEntry(id);
  if (!entry) {
    return false;
  }
  return isHealthyStatusValue(entry.health);
}

function upsertAgentHealthEntry(entry: AgentHealthSnapshotEntry, timestampMs: number) {
  const existing = agentHealthStore.get(entry.id);
  if (existing) {
    const existingMs = Date.parse(existing.lastChecked);
    if (!Number.isNaN(existingMs) && timestampMs < existingMs) {
      return;
    }
  }

  const normalizedTimestamp = new Date(timestampMs).toISOString();
  agentHealthStore.set(entry.id, {
    ...entry,
    lastChecked: normalizedTimestamp,
    label: entry.label || existing?.label
  });
}

function sanitizePayload(payload: RawAgentStatusPayload) {
  const key = deriveKey(payload);
  if (!key) {
    console.warn('[agentHealth] skipping status update without identifiable key');
    return null;
  }

  const health = normalizeHealthValue(payload.health);
  const timestamp = normalizeTimestamp(payload.timestamp);
  const timestampMs = new Date(timestamp).getTime();

  return {
    key,
    entry: {
      id: key,
      health,
      lastChecked: timestamp,
      label: normalizeStringField(payload.label) || normalizeStringField(payload.agentName)
    },
    timestampMs
  };
}

export function processAgentStatusMessage(message: string) {
  try {
    const parsed = JSON.parse(message);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('agent status payload is not an object');
    }

    const sanitized = sanitizePayload(parsed as RawAgentStatusPayload);
    if (!sanitized) {
      return;
    }

    upsertAgentHealthEntry(sanitized.entry, sanitized.timestampMs);
  } catch (err) {
    console.warn('[agentHealth] failed to parse message', err);
  }
}

function attachLogging(sub: Redis) {
  sub.on('ready', () => {
    console.log('[agentHealth] ready for agentos/status messages');
  });
  sub.on('end', () => {
    console.warn('[agentHealth] subscriber connection closed');
  });
  sub.on('error', (err) => {
    console.error('[agentHealth] subscriber error', err);
  });
}

export async function startAgentHealthSubscriber() {
  if (subscriberActive) {
    return;
  }

  const subscriber = redisClient.duplicate();
  agentHealthSubscriber = subscriber;
  attachLogging(subscriber);

  try {
    await subscriber.connect();
    await subscriber.subscribe(AGENT_STATUS_CHANNEL);
    subscriber.on('message', (channel, message) => {
      if (channel === AGENT_STATUS_CHANNEL) {
        processAgentStatusMessage(message);
      }
    });
    subscriberActive = true;
    console.log(`[agentHealth] subscribed to ${AGENT_STATUS_CHANNEL}`);
  } catch (err) {
    console.error('[agentHealth] failed to subscribe', err);
    await subscriber.disconnect();
    agentHealthSubscriber = null;
    subscriberActive = false;
  }
}

export async function stopAgentHealthSubscriber() {
  if (!agentHealthSubscriber) {
    return;
  }

  try {
    await agentHealthSubscriber.unsubscribe(AGENT_STATUS_CHANNEL);
  } catch (err) {
    console.warn('[agentHealth] failed to unsubscribe gracefully', err);
  }

  try {
    await agentHealthSubscriber.disconnect();
  } catch (err) {
    console.warn('[agentHealth] subscriber disconnect error', err);
  } finally {
    agentHealthSubscriber = null;
    subscriberActive = false;
  }
}

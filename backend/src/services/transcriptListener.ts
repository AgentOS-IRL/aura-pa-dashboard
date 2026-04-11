import type Redis from 'ioredis';
import { redisClient } from '../config/redis';
import { saveTranscript } from './transcriptStorage';

const CHANNEL_PREFIX = 'aura/transcript/';
const PATTERN = `${CHANNEL_PREFIX}*`;

let subscriber: Redis | null = null;

function extractSessionId(channel: string): string | null {
  if (!channel || !channel.startsWith(CHANNEL_PREFIX)) {
    return null;
  }

  const sessionId = channel.substring(CHANNEL_PREFIX.length).trim();
  return sessionId || null;
}

function normalizeMessage(message: string): { payload: string; metadata?: Record<string, unknown> } {
  try {
    const parsed = JSON.parse(message);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { payload: payloadField, text, ...rest } = parsed as Record<string, unknown>;
      const payload = typeof payloadField === 'string'
        ? payloadField
        : typeof text === 'string'
          ? text
          : message;
      return {
        payload,
        metadata: Object.keys(rest).length ? rest : undefined
      };
    }

    return { payload: message };
  } catch (error) {
    console.warn('Unable to parse transcript payload as JSON, storing raw message', error);
    return { payload: message };
  }
}

function handleMessage(channel: string, message: string) {
  const sessionId = extractSessionId(channel);

  if (!sessionId) {
    console.warn('Skipping transcript payload from unexpected channel', channel);
    return;
  }

  const { payload, metadata } = normalizeMessage(message);

  try {
    saveTranscript(sessionId, payload, metadata);
  } catch (error) {
    console.error('Failed to persist transcript for session', sessionId, error);
  }
}

export interface TranscriptListenerOptions {
  redis?: Redis;
}

async function subscribe(client: Redis) {
  let isNewSubscriber = false;

  if (!subscriber) {
    subscriber = client.duplicate();
    isNewSubscriber = true;

    subscriber.on('error', (error) => {
      console.error('Transcript listener Redis error', error);
    });

    subscriber.on('close', () => {
      console.warn('Transcript listener Redis connection closed');
    });

    subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        handleMessage(channel, message);
      } catch (error) {
        console.error('Unhandled error while handling transcript message', error);
      }
    });
  }

  try {
    await subscriber.psubscribe(PATTERN);
    console.log('Subscribed to transcript channel pattern', PATTERN);
  } catch (error) {
    console.error('Failed to subscribe transcript listener to Redis', error);
    if (isNewSubscriber) {
      try {
        await subscriber.quit();
      } catch (closeError) {
        console.error('Error while closing transcript listener after failed subscription', closeError);
      }
      subscriber = null;
    }
    throw error;
  }

  return subscriber;
}

export async function startTranscriptListener(options?: TranscriptListenerOptions): Promise<Redis> {
  if (subscriber) {
    return subscriber;
  }

  const client = options?.redis ?? redisClient;

  return subscribe(client);
}

export async function stopTranscriptListener(): Promise<void> {
  if (!subscriber) {
    return;
  }

  const closing = subscriber;
  subscriber = null;

  try {
    await closing.quit();
  } catch (error) {
    console.error('Error while closing transcript listener Redis client', error);
  }
}

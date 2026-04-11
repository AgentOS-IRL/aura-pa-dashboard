import { redisClient } from '../config/redis';

export const AUDIO_KEY_PREFIX = 'aura/audio';
export const AUDIO_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days in seconds

export async function recordAudioChunk(sessionId: string, chunk: Buffer): Promise<void> {
  const normalizedSessionId = sessionId?.trim();

  if (!normalizedSessionId) {
    throw new Error('sessionId is required to persist audio chunks');
  }

  if (!chunk || chunk.length === 0 || !Buffer.isBuffer(chunk)) {
    throw new Error('audio chunk must be a non-empty Buffer');
  }

  const key = `${AUDIO_KEY_PREFIX}/${normalizedSessionId}`;

  await (redisClient as any).rpushBuffer(key, chunk);
  await redisClient.expire(key, AUDIO_TTL_SECONDS);
}

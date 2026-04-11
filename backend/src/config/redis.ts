import Redis, { RedisOptions } from 'ioredis';

const DEFAULT_HOST = '192.168.8.129';
const DEFAULT_PORT = 6379;
const RETRY_LIMIT_MS = 2000;

const retryStrategy = (times: number) => {
  const delay = Math.min(times * 100, RETRY_LIMIT_MS);
  return delay;
};

const baseOptions: RedisOptions = {
  retryStrategy,
};

if (process.env.REDIS_PASSWORD) {
  baseOptions.password = process.env.REDIS_PASSWORD;
}

const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, baseOptions)
  : new Redis({
      host: process.env.REDIS_HOST ?? DEFAULT_HOST,
      port: Number.parseInt(process.env.REDIS_PORT ?? `${DEFAULT_PORT}`, 10),
      ...baseOptions
    });

redisClient.on('connect', () => {
  console.log('Redis client connecting to', redisClient.options.host);
});
redisClient.on('ready', () => {
  console.log('Redis client ready');
});
redisClient.on('error', (err) => {
  console.error('Redis client error', err);
});
redisClient.on('close', () => {
  console.warn('Redis client connection closed');
});
redisClient.on('reconnecting', () => {
  console.warn('Redis client reconnecting');
});

export { redisClient };

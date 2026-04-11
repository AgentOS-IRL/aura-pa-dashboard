import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { startTranscriptListener, stopTranscriptListener } from './transcriptListener';
import { saveTranscript } from '../services/transcriptStorage';

vi.mock('../services/transcriptStorage', () => ({
  saveTranscript: vi.fn()
}));

const mockSaveTranscript = vi.mocked(saveTranscript);

type MockSubscriber = {
  handlers: Record<string, (...args: unknown[]) => void>;
  psubscribe: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (...args: unknown[]) => void) => MockSubscriber;
  quit: ReturnType<typeof vi.fn>;
};

type MockRedis = {
  duplicate: () => MockSubscriber;
};

function createMockSubscriber(): MockSubscriber {
  const handlers: MockSubscriber['handlers'] = {};
  const subscriber: MockSubscriber = {
    handlers,
    psubscribe: vi.fn().mockResolvedValue(null),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
      return subscriber;
    }),
    quit: vi.fn().mockResolvedValue(undefined)
  };

  return subscriber;
}

describe('transcriptListener', () => {
  let mockSubscriber: MockSubscriber;
  let mockRedis: MockRedis;

  beforeEach(() => {
    mockSubscriber = createMockSubscriber();
    mockRedis = {
      duplicate: vi.fn(() => mockSubscriber)
    };
    mockSaveTranscript.mockClear();
  });

  afterEach(async () => {
    await stopTranscriptListener();
  });

  it('subscribes to the transcript pattern', async () => {
    await startTranscriptListener({ redis: mockRedis as unknown as Redis });

    expect(mockRedis.duplicate).toHaveBeenCalled();
    expect(mockSubscriber.psubscribe).toHaveBeenCalledWith('aura/transcript/*');
    expect(typeof mockSubscriber.handlers.pmessage).toBe('function');
  });

  it('persists the payload and metadata for each message', async () => {
    await startTranscriptListener({ redis: mockRedis as unknown as Redis });

    const handler = mockSubscriber.handlers.pmessage as (
      _pattern: string,
      channel: string,
      message: string
    ) => void;

    handler(
      'aura/transcript/*',
      'aura/transcript/session-123',
      JSON.stringify({ text: 'hello', source: 'redis' })
    );

    expect(mockSaveTranscript).toHaveBeenCalledWith('session-123', 'hello', { source: 'redis' });
  });

  it('logs a warning when the payload is invalid JSON', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await startTranscriptListener({ redis: mockRedis as unknown as Redis });

      const handler = mockSubscriber.handlers.pmessage as (
        _pattern: string,
        channel: string,
        message: string
      ) => void;

      handler('aura/transcript/*', 'aura/transcript/session-123', '{ invalid json');

      expect(warnSpy).toHaveBeenCalled();
      expect(mockSaveTranscript).toHaveBeenCalledWith('session-123', '{ invalid json', undefined);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

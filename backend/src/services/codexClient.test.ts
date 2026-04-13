import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CodexClient, DEFAULT_MODEL_ID } from './codexClient';
import { resetLangfuseConfigCache } from '../config/langfuse';

const AUTH_PATH = path.resolve(__dirname, '../../test-fixtures/codex-auth.json');

interface LangfuseMockState {
  generationEnd: ReturnType<typeof vi.fn>;
  traceGeneration: ReturnType<typeof vi.fn>;
  trace: ReturnType<typeof vi.fn>;
  langfuseMock: ReturnType<typeof vi.fn>;
}

vi.mock('langfuse', () => {
  const generationEnd = vi.fn();
  const generationClient = { end: generationEnd };
  const traceGeneration = vi.fn().mockReturnValue(generationClient);
  const trace = vi.fn().mockReturnValue({ generation: traceGeneration });
  const langfuseMock = vi.fn().mockImplementation(() => ({ trace }));
  const state: LangfuseMockState = {
    generationEnd,
    traceGeneration,
    trace,
    langfuseMock,
  };
  const symbol = Symbol.for('aura-pa-langfuse-test-state');
  (globalThis as unknown as Record<symbol, unknown>)[symbol] = state;
  return {
    __esModule: true,
    default: langfuseMock,
  };
});

function getLangfuseMockState(): LangfuseMockState {
  const symbol = Symbol.for('aura-pa-langfuse-test-state');
  const state = (globalThis as unknown as Record<symbol, unknown>)[symbol];
  if (!state) {
    throw new Error('Langfuse mock state is not initialized');
  }
  return state as LangfuseMockState;
}

function createStreamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body,
    text: async () => chunks.join(''),
    json: async () => ({}),
  };
}

function setupFetch(lines: string[]) {
  const fetchMock = vi.fn().mockResolvedValue(createStreamingResponse(lines));
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
  return fetchMock;
}

describe('CodexClient Langfuse instrumentation', () => {
  const originalFetch = globalThis.fetch;
  let langfuseState: LangfuseMockState;

  beforeEach(() => {
    resetLangfuseConfigCache();
    langfuseState = getLangfuseMockState();
    langfuseState.traceGeneration.mockClear();
    langfuseState.trace.mockClear();
    langfuseState.langfuseMock.mockClear();
    langfuseState.generationEnd.mockClear();
  });

  afterEach(() => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it('records a trace for executeSync when Langfuse is configured', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_BASE_URL = 'https://langfuse.test';
    resetLangfuseConfigCache();

    const fetchMock = setupFetch([
      'data: {"type":"response.output_text.delta","delta":"Hi"}\n',
      'data: {"type":"response.output_text.done","response":{"output":[{"content":[{"text":" there"}]}]}}\n',
      'data: [DONE]\n',
    ]);

    const client = new CodexClient({ authPath: AUTH_PATH });
    const result = await client.executeSync('Hello');

    expect(result).toBe('Hi there');
    expect(fetchMock).toHaveBeenCalled();
    expect(langfuseState.langfuseMock).toHaveBeenCalledWith({
      secretKey: 'sk-test',
      publicKey: 'pk-test',
      baseUrl: 'https://langfuse.test',
      sdkIntegration: 'aura-pa-backend-codex',
    });

    expect(langfuseState.trace).toHaveBeenCalledWith({
      name: 'codex',
      userId: 'test-account-id',
      metadata: {
        callName: 'executeSync',
        model: DEFAULT_MODEL_ID,
      },
    });

    expect(langfuseState.traceGeneration).toHaveBeenCalledWith({
      name: 'executeSync',
      model: DEFAULT_MODEL_ID,
      input: {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      },
    });

    expect(langfuseState.generationEnd).toHaveBeenCalledWith({ output: 'Hi there' });
  });

  it('records a structured schema trace with metadata', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_BASE_URL = 'https://langfuse.test';
    resetLangfuseConfigCache();

    const fetchMock = setupFetch([
      'data: {"type":"response.output_text.done","response":{"output":[{"content":[{"text":"{\\"foo\\":\\"bar\\"}"}]}]}}\n',
      'data: [DONE]\n',
    ]);

    const client = new CodexClient({ authPath: AUTH_PATH });
    const parsed = await client.executeStructured('{ prompt }', { type: 'object' }, 'responseSchema');

    expect(parsed).toEqual({ foo: 'bar' });
    expect(fetchMock).toHaveBeenCalled();
    expect(langfuseState.traceGeneration).toHaveBeenCalledWith({
      name: 'executeStructured/responseSchema',
      model: DEFAULT_MODEL_ID,
      input: {
        messages: [
          { role: 'user', content: '{ prompt }' },
          {
            role: 'system',
            content: 'Structured response expected (schema: responseSchema, method: json_schema).',
          },
        ],
      },
    });

    expect(langfuseState.trace).toHaveBeenCalledWith({
      name: 'codex',
      userId: 'test-account-id',
      metadata: {
        callName: 'executeStructured/responseSchema',
        model: DEFAULT_MODEL_ID,
        schema: 'responseSchema',
        method: 'json_schema',
      },
    });

    expect(langfuseState.generationEnd).toHaveBeenCalledWith({ output: '{"foo":"bar"}' });
  });

  it('skips Langfuse when the secret is missing', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    resetLangfuseConfigCache();

    setupFetch([
      'data: {"type":"response.output_text.delta","delta":"skip"}\n',
      'data: [DONE]\n',
    ]);

    const client = new CodexClient({ authPath: AUTH_PATH });
    await client.executeSync('skip');

    expect(langfuseState.langfuseMock).not.toHaveBeenCalled();
    expect(langfuseState.trace).not.toHaveBeenCalled();
    expect(langfuseState.traceGeneration).not.toHaveBeenCalled();
    expect(langfuseState.generationEnd).not.toHaveBeenCalled();
  });
});

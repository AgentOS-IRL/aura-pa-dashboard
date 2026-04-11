import { afterEach, describe, expect, it, vi } from 'vitest';

const mockResponsesCreate = vi.fn();
const mockOpenAIConstructor = vi.fn(() => ({
  responses: {
    create: mockResponsesCreate
  }
}));

class MockOpenAIError extends Error {}
class MockAuthenticationError extends MockOpenAIError {}

const CONFIG_DEFAULT = {
  apiKey: 'api-key',
  langchainId: 'langchain-model',
  authPath: '/tmp/auth.json'
} as const;

let configOverrides: typeof CONFIG_DEFAULT = { ...CONFIG_DEFAULT };

vi.mock('openai', () => ({
  default: mockOpenAIConstructor,
  OpenAI: mockOpenAIConstructor,
  OpenAIError: MockOpenAIError,
  AuthenticationError: MockAuthenticationError
}));

vi.mock('../config/openai', () => ({
  getCodexApiKey: () => configOverrides.apiKey,
  getLangchainModelId: () => configOverrides.langchainId,
  getCodexAuthPath: () => configOverrides.authPath
}));

async function loadClient(overrides: Partial<typeof CONFIG_DEFAULT> = {}) {
  vi.resetModules();
  configOverrides = { ...CONFIG_DEFAULT, ...overrides };
  return import('./openaiClient');
}

describe('openaiClient service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes the OpenAI client with the configured api key once', async () => {
    const { getOpenAIClient } = await loadClient({ apiKey: 'secret-key' });
    const first = getOpenAIClient();
    const second = getOpenAIClient();
    expect(mockOpenAIConstructor).toHaveBeenCalledTimes(1);
    expect(mockOpenAIConstructor).toHaveBeenCalledWith({ apiKey: 'secret-key' });
    expect(first).toBe(second);
  });

  it('submits responses requests using the default langchain model', async () => {
    const { callResponsesApi } = await loadClient({ langchainId: 'default-model' });
    mockResponsesCreate.mockResolvedValue({ id: 'resp-default', model: 'default-model', usage: { total_tokens: 10 } });
    await callResponsesApi({ input: 'hello' });
    expect(mockResponsesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'default-model', input: 'hello' }));
  });

  it('honors the per-call modelId override', async () => {
    const { callResponsesApi } = await loadClient({ langchainId: 'default-model' });
    mockResponsesCreate.mockResolvedValue({ id: 'resp-override', model: 'override-model' });
    await callResponsesApi({ modelId: 'override-model', input: 'payload' });
    expect(mockResponsesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'override-model' }));
  });

  it('wraps authentication failures in OpenAIAuthError', async () => {
    const { callResponsesApi, OpenAIAuthError } = await loadClient({ langchainId: 'default-model' });
    const authError = new MockAuthenticationError('bad key');
    mockResponsesCreate.mockRejectedValueOnce(authError);
    await expect(callResponsesApi({ input: 'payload' })).rejects.toBeInstanceOf(OpenAIAuthError);
  });
});

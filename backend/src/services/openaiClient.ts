import OpenAI, { AuthenticationError, OpenAIError } from 'openai';
import type { ResponseCreateParamsNonStreaming, Response as OpenAIResponse } from 'openai/resources/responses/responses';
import { getCodexApiKey, getCodexAuthPath, getLangchainModelId } from '../config/openai';

export class OpenAIAuthError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    Object.setPrototypeOf(this, OpenAIAuthError.prototype);
    this.name = 'OpenAIAuthError';
    this.cause = cause;
  }
}

export class OpenAIServiceError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    Object.setPrototypeOf(this, OpenAIServiceError.prototype);
    this.name = 'OpenAIServiceError';
    this.cause = cause;
  }
}

let cachedClient: OpenAI | null = null;

function createClient(): OpenAI {
  const apiKey = getCodexApiKey();
  return new OpenAI({ apiKey });
}

export function resetOpenAIClient(): void {
  cachedClient = null;
}

export function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = createClient();
  }
  return cachedClient;
}

export interface CallResponsesParams extends Omit<ResponseCreateParamsNonStreaming, 'model'> {
  modelId?: string;
}

function describeInput(input: ResponseCreateParamsNonStreaming['input']): string {
  if (typeof input === 'string') {
    return input.length > 40 ? `"${input.slice(0, 40)}..."` : `"${input}"`;
  }

  if (Array.isArray(input)) {
    return `array(${input.length})`;
  }

  if (input && typeof input === 'object') {
    const keys = Object.keys(input);
    const snippet = keys.length ? keys.slice(0, 3).join(',') : 'object';
    return `object(${snippet})`;
  }

  return 'empty';
}

export async function callResponsesApi(params: CallResponsesParams): Promise<OpenAIResponse> {
  const { modelId, ...payload } = params;
  const resolvedModelId = modelId ?? getLangchainModelId();
  const request: ResponseCreateParamsNonStreaming = {
    ...payload,
    model: resolvedModelId
  };

  const inputSummary = describeInput(payload.input);
  console.debug(`[OpenAI] calling Responses API (model=${resolvedModelId}, input=${inputSummary})`);

  try {
    const response = await getOpenAIClient().responses.create(request);
    const usageTokens = response.usage?.total_tokens ?? 'n/a';
    console.debug(
      `[OpenAI] Responses API success (id=${response.id}, model=${response.model}, usage=${usageTokens})`
    );
    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw new OpenAIAuthError(
        `Codex authentication failed for ${resolvedModelId} (auth=${getCodexAuthPath()})`,
        error
      );
    }

    if (error instanceof OpenAIError) {
      throw new OpenAIServiceError(
        `OpenAI service error while calling responses (model=${resolvedModelId})`,
        error
      );
    }

    // Pass through unexpected errors so callers can inspect them.
    throw new OpenAIServiceError('Unexpected error while calling the OpenAI Responses API', error as Error);
  }
}

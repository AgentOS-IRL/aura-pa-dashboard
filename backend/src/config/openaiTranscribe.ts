const API_KEY_ENV = "OPENAI_API_KEY";
const BASE_URL_ENV = "OPENAI_BASE_URL";
const ORG_ID_ENV = "OPENAI_ORG_ID";
const PROJECT_ID_ENV = "OPENAI_PROJECT_ID";

export interface OpenAITranscribeConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
}

let cachedConfig: OpenAITranscribeConfig | null = null;

function readOptionalEnv(key: string): string | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function resolveConfig(): OpenAITranscribeConfig {
  const apiKey = readOptionalEnv(API_KEY_ENV);
  if (!apiKey) {
    throw new Error(
      `${API_KEY_ENV} is required to instantiate the OpenAI transcription client. Set the environment variable to a valid API key.`
    );
  }

  return {
    apiKey,
    baseUrl: readOptionalEnv(BASE_URL_ENV),
    organization: readOptionalEnv(ORG_ID_ENV),
    project: readOptionalEnv(PROJECT_ID_ENV),
  };
}

export function getOpenAITranscribeConfig(options?: { reload?: boolean }): OpenAITranscribeConfig {
  if (!options?.reload && cachedConfig) {
    return cachedConfig;
  }

  const config = resolveConfig();
  cachedConfig = config;
  return config;
}

export function resetOpenAITranscribeConfigCache(): void {
  cachedConfig = null;
}

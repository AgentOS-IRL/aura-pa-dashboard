const API_KEY_ENV = "DEEPGRAM_API_KEY";
const BASE_URL_ENV = "DEEPGRAM_BASE_URL";

export interface DeepgramConfig {
  apiKey: string;
  baseUrl?: string;
}

let cachedConfig: DeepgramConfig | null = null;

function readOptionalEnv(key: string): string | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function resolveConfig(): DeepgramConfig {
  const apiKey = readOptionalEnv(API_KEY_ENV);
  if (!apiKey) {
    throw new Error(
      `${API_KEY_ENV} is required to instantiate the Deepgram client. Set the environment variable to a valid API key.`
    );
  }

  return {
    apiKey,
    baseUrl: readOptionalEnv(BASE_URL_ENV),
  };
}

export function getDeepgramConfig(options?: { reload?: boolean }): DeepgramConfig {
  if (!options?.reload && cachedConfig) {
    return cachedConfig;
  }

  const config = resolveConfig();
  cachedConfig = config;
  return config;
}

export function resetDeepgramConfigCache(): void {
  cachedConfig = null;
}

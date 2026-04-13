const SECRET_KEY_ENV = "LANGFUSE_SECRET_KEY";
const PUBLIC_KEY_ENV = "LANGFUSE_PUBLIC_KEY";
const BASE_URL_ENV = "LANGFUSE_BASE_URL";
const DEFAULT_BASE_URL = "https://cloud.langfuse.com";

export interface LangfuseConfig {
  secretKey: string;
  publicKey?: string;
  baseUrl: string;
}

let cachedConfig: LangfuseConfig | null = null;

function readOptionalEnv(key: string): string | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function resolveLangfuseConfig(): LangfuseConfig {
  const secretKey = readOptionalEnv(SECRET_KEY_ENV);
  if (!secretKey) {
    throw new Error(
      `${SECRET_KEY_ENV} is required to enable Langfuse tracing. Set it to the secret key provided by Langfuse.`
    );
  }

  return {
    secretKey,
    publicKey: readOptionalEnv(PUBLIC_KEY_ENV),
    baseUrl: readOptionalEnv(BASE_URL_ENV) || DEFAULT_BASE_URL,
  };
}

export function getLangfuseConfig(options?: { reload?: boolean }): LangfuseConfig {
  if (!options?.reload && cachedConfig) {
    return cachedConfig;
  }

  const config = resolveLangfuseConfig();
  cachedConfig = config;
  return config;
}

export function resetLangfuseConfigCache(): void {
  cachedConfig = null;
}

export function isLangfuseEnabled(): boolean {
  return Boolean(readOptionalEnv(SECRET_KEY_ENV));
}

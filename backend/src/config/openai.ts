import fs from 'fs';
import os from 'os';
import path from 'path';

export interface CodexCredentials {
  api_key?: string;
  token?: string;
  [key: string]: unknown;
}

const LANGCHAIN_MODEL_ENV = 'LANGCHAIN_MODEL_ID';
const CODING_TOOL_AGENT_ENV = 'CODING_TOOL_AGENT';
const CODEX_AUTH_PATH_ENV = 'CODEX_AUTH_PATH';

export const DEFAULT_LANGCHAIN_MODEL_ID = 'gpt-5.1-codex';
export const DEFAULT_CODING_TOOL_AGENT = 'codex';

let cachedCredentials: CodexCredentials | null = null;
let cachedAuthPath: string | null = null;

function expandHome(filePath: string): string {
  if (!filePath.startsWith('~')) {
    return path.resolve(filePath);
  }

  let remainder = filePath.slice(1);
  while (remainder.startsWith(path.sep)) {
    remainder = remainder.slice(1);
  }

  return remainder ? path.join(os.homedir(), remainder) : os.homedir();
}

function resolveAuthPath(): string {
  const override = process.env[CODEX_AUTH_PATH_ENV]?.trim();
  if (override) {
    return expandHome(override);
  }

  return path.join(os.homedir(), '.codex', 'auth.json');
}

function ensureFileExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Codex auth file not found at ${filePath}. Set ${CODEX_AUTH_PATH_ENV} or create ${filePath} with an api_key/token before starting the service.`
    );
  }
}

function parseAuthFile(filePath: string): CodexCredentials {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Codex auth file at ${filePath} must contain a JSON object.`);
    }
    return parsed as CodexCredentials;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

function ensureCredentialKey(creds: CodexCredentials, filePath: string): string {
  const looseCreds = creds as Record<string, unknown>;
  const candidate =
    (typeof creds.api_key === 'string' ? creds.api_key : undefined) ??
    (typeof creds.token === 'string' ? creds.token : undefined) ??
    (typeof looseCreds.apiKey === 'string' ? looseCreds.apiKey : undefined);

  if (!candidate || !candidate.trim()) {
    throw new Error(
      `Codex auth file at ${filePath} must include a non-empty "api_key" or "token" field.`
    );
  }

  return candidate.trim();
}

function loadCredentials(filePath: string): CodexCredentials {
  ensureFileExists(filePath);
  const credentials = parseAuthFile(filePath);
  ensureCredentialKey(credentials, filePath);
  return credentials;
}

export function getCodexAuthPath(): string {
  return resolveAuthPath();
}

export function getCodingToolAgent(): string {
  return process.env[CODING_TOOL_AGENT_ENV]?.trim() || DEFAULT_CODING_TOOL_AGENT;
}

export function getLangchainModelId(): string {
  return process.env[LANGCHAIN_MODEL_ENV]?.trim() || DEFAULT_LANGCHAIN_MODEL_ID;
}

export function getCodexCredentials(options?: { reload?: boolean }): CodexCredentials {
  const authPath = getCodexAuthPath();
  const shouldReload = options?.reload ?? false;

  if (!shouldReload && cachedCredentials && cachedAuthPath === authPath) {
    return cachedCredentials;
  }

  const credentials = loadCredentials(authPath);
  cachedCredentials = credentials;
  cachedAuthPath = authPath;
  return credentials;
}

export function resetCodexCredentialsCache(): void {
  cachedCredentials = null;
  cachedAuthPath = null;
}

export function getCodexApiKey(): string {
  const credentials = getCodexCredentials();
  const authPath = cachedAuthPath ?? getCodexAuthPath();
  return ensureCredentialKey(credentials, authPath);
}

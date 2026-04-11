import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCodexApiKey,
  getCodexAuthPath,
  getCodexCredentials,
  getCodingToolAgent,
  getLangchainModelId,
  resetCodexCredentialsCache
} from './openai';

describe('openai config helpers', () => {
  afterEach(() => {
    resetCodexCredentialsCache();
    vi.restoreAllMocks();
    delete process.env.CODEX_AUTH_PATH;
    delete process.env.LANGCHAIN_MODEL_ID;
    delete process.env.CODING_TOOL_AGENT;
  });

  it('reports the default langchain model id and respects overrides', () => {
    expect(getLangchainModelId()).toBe('gpt-5.1-codex');
    process.env.LANGCHAIN_MODEL_ID = 'gpt-6.0-test';
    expect(getLangchainModelId()).toBe('gpt-6.0-test');
  });

  it('reports the default coding tool agent and respects overrides', () => {
    expect(getCodingToolAgent()).toBe('codex');
    process.env.CODING_TOOL_AGENT = 'custom-codex';
    expect(getCodingToolAgent()).toBe('custom-codex');
  });

  it('defaults the auth path to ~/.codex/auth.json', () => {
    const home = path.join('/', 'home', 'tester');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    delete process.env.CODEX_AUTH_PATH;
    expect(getCodexAuthPath()).toBe(path.join(home, '.codex', 'auth.json'));
  });

  it('respects CODEX_AUTH_PATH overrides and expands tilde shortcuts', () => {
    const home = path.join('/', 'home', 'tester');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    process.env.CODEX_AUTH_PATH = '~/custom/codex.json';
    expect(getCodexAuthPath()).toBe(path.join(home, 'custom', 'codex.json'));
  });

  it('loads credentials from disk and caches the result', () => {
    const authPath = path.join('/', 'tmp', 'codex.json');
    process.env.CODEX_AUTH_PATH = authPath;

    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fileContents = JSON.stringify({ api_key: '   secret-123   ' });
    const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(fileContents);

    const firstCall = getCodexCredentials();
    expect(firstCall.api_key).toBe('   secret-123   ');
    expect(existsSpy).toHaveBeenCalledWith(authPath);
    expect(readSpy).toHaveBeenCalledWith(authPath, 'utf8');

    const secondCall = getCodexCredentials();
    expect(secondCall).toBe(firstCall);
    expect(readSpy).toHaveBeenCalledTimes(1);

    // Reset and force reload should read again.
    resetCodexCredentialsCache();
    const thirdCall = getCodexCredentials({ reload: true });
    expect(readSpy).toHaveBeenCalledTimes(2);
    expect(thirdCall).not.toBe(firstCall);
  });

  it('throws when the auth file is missing', () => {
    const missingPath = path.join('/', 'tmp', 'missing.json');
    process.env.CODEX_AUTH_PATH = missingPath;
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(() => getCodexCredentials({ reload: true })).toThrow(/Codex auth file not found/);
  });

  it('throws when the file lacks credentials', () => {
    const invalidPath = path.join('/', 'tmp', 'invalid.json');
    process.env.CODEX_AUTH_PATH = invalidPath;
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');

    expect(() => getCodexCredentials({ reload: true })).toThrow(/api_key|token/);
  });

  it('trims and exposes the api key via getCodexApiKey', () => {
    const authPath = path.join('/', 'tmp', 'key.json');
    process.env.CODEX_AUTH_PATH = authPath;
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ api_key: '  trimmed  ' }));

    expect(getCodexApiKey()).toBe('trimmed');
  });
});

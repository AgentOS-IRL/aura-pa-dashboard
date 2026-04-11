import { describe, expect, it, vi } from 'vitest';

const loadAuraPath = async () => {
  return await import('./auraPath');
};

describe('auraPath helper', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AURA_BASE_PATH;
    vi.resetModules();
  });

  it('defaults to /aura and trims the prefix when matching', async () => {
    vi.resetModules();
    const { AURA_BASE_PATH, BACKEND_PATH_PREFIX, stripAuraBasePath } = await loadAuraPath();

    expect(AURA_BASE_PATH).toBe('/aura');
    expect(BACKEND_PATH_PREFIX).toBe('/aura');
    expect(stripAuraBasePath('/aura/transcript')).toBe('/transcript');
    expect(stripAuraBasePath('/aura')).toBe('/');
  });

  it('supports a root base path by omitting the prefix', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_AURA_BASE_PATH = '/';
    const { AURA_BASE_PATH, BACKEND_PATH_PREFIX } = await loadAuraPath();

    expect(AURA_BASE_PATH).toBe('/');
    expect(BACKEND_PATH_PREFIX).toBe('');
  });

  it('normalizes trailing slashes in custom values', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_AURA_BASE_PATH = '/aura/';
    const { AURA_BASE_PATH, BACKEND_PATH_PREFIX } = await loadAuraPath();

    expect(AURA_BASE_PATH).toBe('/aura');
    expect(BACKEND_PATH_PREFIX).toBe('/aura');
  });
});

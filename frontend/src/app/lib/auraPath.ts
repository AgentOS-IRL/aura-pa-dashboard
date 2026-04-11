const DEFAULT_NEXT_AURA_BASE_PATH = '/aura';

function ensureLeadingSlash(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '/';
  }

  const withLeading = ensureLeadingSlash(trimmed);
  if (withLeading === '/') {
    return '/';
  }

  return withLeading.replace(/\/+$/, '');
}

const configuredPath = process.env.NEXT_PUBLIC_AURA_BASE_PATH ?? DEFAULT_NEXT_AURA_BASE_PATH;
export const AURA_BASE_PATH = normalizeBasePath(configuredPath);
export const BACKEND_PATH_PREFIX = AURA_BASE_PATH === '/' ? '' : AURA_BASE_PATH;

export function stripAuraBasePath(pathname?: string) {
  const rawPath = pathname || '/';
  if (AURA_BASE_PATH === '/' || !rawPath.startsWith(AURA_BASE_PATH)) {
    return rawPath || '/';
  }

  const stripped = rawPath.slice(AURA_BASE_PATH.length);
  if (!stripped || stripped === '/') {
    return '/';
  }

  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

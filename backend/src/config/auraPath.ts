const DEFAULT_AURA_BASE_PATH = '/aura';

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeBasePath(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '/';
  }

  const withLeading = ensureLeadingSlash(trimmed);
  if (withLeading === '/') {
    return '/';
  }

  return withLeading.replace(/\/+$/, '');
}

const configuredPath = process.env.AURA_BASE_PATH ?? DEFAULT_AURA_BASE_PATH;
export const auraBasePath = normalizeBasePath(configuredPath);
export const auraRoutePrefix = auraBasePath === '/' ? '' : auraBasePath;
export const auraPublicPath = auraBasePath === '/' ? '' : auraBasePath;
export const auraRouteSegment = auraBasePath === '/' ? '' : auraBasePath.replace(/^\//, '');

export function withAuraBasePath(route: string) {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${auraRoutePrefix}${normalizedRoute}`;
}

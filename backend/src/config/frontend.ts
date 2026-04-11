import fs from 'fs';
import path from 'path';
import express, { Express, Response } from 'express';
import { auraRouteSegment } from './auraPath';

export const frontendBuildDir = process.env.FRONTEND_BUILD_DIR ?? 'out';
const frontendDistRoot = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'frontend',
  frontendBuildDir
);
export const frontendDistPath = auraRouteSegment
  ? path.join(frontendDistRoot, auraRouteSegment)
  : frontendDistRoot;

export function ensureFrontendDistPathExists() {
  if (!fs.existsSync(frontendDistPath)) {
    throw new Error(
      `Frontend build directory not found at ${frontendDistPath}. Run "npm run build:frontend" or set FRONTEND_BUILD_DIR.`
    );
  }
  return frontendDistPath;
}

export function sendSPAIndex(res: Response) {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
}

export function configureFrontendStatic(app: Express, basePath: string) {
  const mountBase = basePath === '/' ? '' : basePath;
  const servePath = mountBase || '/';
  const fallbackRoute = mountBase ? `${mountBase}/*` : '/*';

  app.use(servePath, express.static(frontendDistPath));
  app.get(servePath, (_req, res) => {
    sendSPAIndex(res);
  });
  app.get(fallbackRoute, (_req, res) => {
    sendSPAIndex(res);
  });
}

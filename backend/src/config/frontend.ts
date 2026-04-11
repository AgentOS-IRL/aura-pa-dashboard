import fs from 'fs';
import path from 'path';
import express, { Express, Response } from 'express';

export const frontendBuildDir = process.env.FRONTEND_BUILD_DIR ?? 'out';
const frontendDistRoot = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'frontend',
  frontendBuildDir
);
export const frontendDistPath = frontendDistRoot;

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
  const routeBase = mountBase || '/';

  app.use(routeBase, express.static(frontendDistPath));
  app.get(routeBase, (_req, res) => {
    sendSPAIndex(res);
  });
  const fallbackRoute = routeBase === '/' ? '/*' : `${routeBase}/*`;
  app.get(fallbackRoute, (_req, res) => {
    sendSPAIndex(res);
  });
}

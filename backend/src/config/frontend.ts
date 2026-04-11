import fs from 'fs';
import path from 'path';
import express, { Express, Response } from 'express';

export const frontendBuildDir = process.env.FRONTEND_BUILD_DIR ?? 'out';
export const frontendDistPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'frontend',
  frontendBuildDir
);

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

export function configureFrontendStatic(app: Express) {
  app.use(express.static(frontendDistPath));
  app.get('*', (_req, res) => {
    sendSPAIndex(res);
  });
}

import http from 'http';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import audioRouter from './routes/audio';
import healthRouter from './routes/health';
import transcriptRouter from './routes/transcript';
import transcriptsRouter from './routes/transcripts';
import transcriptClassificationsRouter from './routes/transcriptClassifications';
import classificationsRouter from './routes/classifications';
import usageRouter from './routes/usage';
import {
  configureFrontendStatic,
  ensureFrontendDistPathExists,
  frontendBuildDir
} from './config/frontend';
import { auraBasePath, withAuraBasePath } from './config/auraPath';
import { startAgentHealthSubscriber, stopAgentHealthSubscriber } from './services/agentHealth';
import './services/classificationStorage';
import './services/transcriptClassificationStorage';

const swaggerDocument = YAML.load(path.join(__dirname, '..', 'openapi.yaml'));

type BodyParserError = Error & {
  status?: number;
  type?: string;
};

const classificationRoute = withAuraBasePath('/classifications');

function isTranscriptJsonRoute(req: Request) {
  return req.method === 'POST' && req.path.endsWith('/transcript');
}

function isBodyParserError(err: unknown): err is BodyParserError {
  if (!(err instanceof Error)) {
    return false;
  }

  if (err instanceof SyntaxError) {
    return true;
  }

  const typed = err as BodyParserError;
  return Boolean(typed.type?.startsWith('entity.'));
}

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(morgan('tiny'));

  const corsOptions = { origin: '*' };
  app.use(cors(corsOptions));

  app.use((_, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  });

  // Keep the documentation on a dedicated route so new APIs can share the same stack later.
  app.use(withAuraBasePath('/docs'), swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.get(withAuraBasePath('/docs.json'), (_, res) => res.json(swaggerDocument));

  app.use(withAuraBasePath('/sessions'), audioRouter);
  app.use(withAuraBasePath('/sessions'), transcriptRouter);
  app.use(withAuraBasePath('/transcripts'), transcriptsRouter);
  app.use(withAuraBasePath('/transcripts'), transcriptClassificationsRouter);
  app.use(withAuraBasePath('/classifications'), classificationsRouter);
  app.use(withAuraBasePath('/usage'), usageRouter);

  app.use(withAuraBasePath('/health'), healthRouter);

  configureFrontendStatic(app, auraBasePath);

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const isClassificationJsonRoute = req.method === 'POST' && req.path === classificationRoute;
    const isKnownJsonRoute = isTranscriptJsonRoute(req) || isClassificationJsonRoute;

    if (isKnownJsonRoute && isBodyParserError(err)) {
      const routeLabel = isClassificationJsonRoute ? 'classification' : 'transcript';
      console.warn(`Invalid ${routeLabel} JSON payload`, err);
      const status = err.status ?? 400;
      return res.status(status).json({ error: 'Invalid JSON payload' });
    }
    next(err);
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error in health service', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export function startServer() {
  const port = Number.parseInt(process.env.PORT ?? '4000', 10);
  const resolvedFrontendPath = ensureFrontendDistPathExists();
  console.log(
    `Serving frontend build from ${resolvedFrontendPath} (FRONTEND_BUILD_DIR=${frontendBuildDir}, base path=${auraBasePath})`
  );

  const app = createApp();
  const server = http.createServer(app);
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);

    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    await stopAgentHealthSubscriber();

    server.close(() => {
      console.log('Server closed, exiting.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Force exiting after shutdown timeout.');
      process.exit(1);
    }, 10_000);
  };

  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, () => {
      void shutdown(signal);
    });
  });

  const baseUrl = auraBasePath === '/' ? '' : auraBasePath;
  server.listen(port, () => {
    console.log(`Health service listening on http://localhost:${port}${baseUrl}`);
    void startAgentHealthSubscriber().catch((err) => {
      console.error('[agentHealth] failed to start subscriber', err);
    });
  });

  return server;
}

if (require.main === module) {
  startServer();
}

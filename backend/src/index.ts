import http from 'http';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { startTranscriptListener, stopTranscriptListener } from './services/transcriptListener';
import audioRouter from './routes/audio';
import healthRouter from './routes/health';

const swaggerDocument = YAML.load(path.join(__dirname, '..', 'openapi.yaml'));

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
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.get('/docs.json', (_, res) => res.json(swaggerDocument));

  app.use('/sessions', audioRouter);

  app.use('/health', healthRouter);

  app.use((_, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error in health service', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export function startServer() {
  const port = Number.parseInt(process.env.PORT ?? '4000', 10);
  const app = createApp();
  const server = http.createServer(app);
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);

    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    (async () => {
      try {
        await stopTranscriptListener();
      } catch (error) {
        console.error('Error while stopping transcript listener', error);
      }

      server.close(() => {
        console.log('Server closed, exiting.');
        process.exit(0);
      });
    })();

    setTimeout(() => {
      console.error('Force exiting after shutdown timeout.');
      process.exit(1);
    }, 10_000);
  };

  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

  startTranscriptListener().catch((error) => {
    console.error('Failed to start transcript listener', error);
  });

  server.listen(port, () => {
    console.log(`Health service listening on http://localhost:${port}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

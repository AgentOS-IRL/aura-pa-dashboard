import http from 'http';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import audioRouter from './routes/audio';
import healthRouter from './routes/health';

const swaggerDocument = YAML.load(path.join(__dirname, '..', 'openapi.yaml'));

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(morgan('tiny'));

  const allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const corsOptions = process.env.NODE_ENV === 'development' ? { origin: '*' } : { origin: allowedOrigin };
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

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);

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
    process.on(signal, () => shutdown(signal));
  });

  server.listen(port, () => {
    console.log(`Health service listening on http://localhost:${port}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

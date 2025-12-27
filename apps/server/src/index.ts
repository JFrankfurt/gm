import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH ?? path.join(dataDir, 'workspaces.sqlite3');

const app = buildApp({ dbPath });

app.listen({ port, host }).catch((err) => {
  app.log.error({ err }, 'Failed to start server');
  process.exit(1);
});

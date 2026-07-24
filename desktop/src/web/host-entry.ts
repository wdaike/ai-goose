import * as path from 'node:path';
import { startWebHost } from './host';

const port = Number(process.env.GOOSE_WEB_PORT ?? 5173);
const host = process.env.GOOSE_WEB_HOST ?? '127.0.0.1';
const token = process.env.GOOSE_WEB_TOKEN ?? '';
const mode = process.env.GOOSE_WEB_MODE === 'prod' ? 'prod' : 'dev';
const staticDir = process.env.GOOSE_WEB_STATIC ?? path.resolve(process.cwd(), 'dist-web');

startWebHost({ port, host, token, mode, staticDir })
  .then(({ url }) => {
    console.log(`\n  iCodex web host (${mode}) listening on ${url}`);
    console.log(`  Open: ${token ? `${url}?token=${token}` : url}\n`);
  })
  .catch((error) => {
    console.error('Failed to start web host:', error);
    process.exit(1);
  });

import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer, type Server } from 'node:http';
import * as path from 'node:path';
import { CodexProcess, type JsonRpcMessage } from '../codex/codexProcess';

export interface WebHostOptions {
  port: number;
  host: string;
  /** When empty, the host serves without authentication (loopback dev). */
  token: string;
  /** `dev` mounts Vite in middleware mode; `prod` serves a built bundle. */
  mode: 'dev' | 'prod';
  /** Vite project root in dev; defaults to the current working directory. */
  root?: string;
  /** Directory of the built renderer in prod. */
  staticDir?: string;
}

export interface WebHostHandle {
  url: string;
  close: () => Promise<void>;
}

/**
 * Serves the renderer and bridges a single shared `codex app-server` process to
 * every connected browser. Requests, notifications, and approval responses are
 * HTTP POSTs; codex→client messages fan out over a Server-Sent Events stream.
 * All codex transport lives in `CodexProcess` — this host only decides how the
 * server-initiated messages reach the browser, mirroring the Electron bridge.
 */
export async function startWebHost(options: WebHostOptions): Promise<WebHostHandle> {
  const root = options.root ?? process.cwd();
  const app = express();
  app.use(express.json({ limit: '64mb' }));

  const clients = new Set<Response>();
  const codex = new CodexProcess((msg: JsonRpcMessage) => {
    const frame = `data: ${JSON.stringify(msg)}\n\n`;
    for (const client of clients) client.write(frame);
  });

  const requireToken = (req: Request, res: Response, next: NextFunction): void => {
    if (!options.token) {
      next();
      return;
    }
    const provided = (req.query.token as string | undefined) ?? req.get('x-goose-token');
    if (provided !== options.token) {
      res.status(401).end('unauthorized');
      return;
    }
    next();
  };

  app.get('/codex/events', requireToken, (req: Request, res: Response) => {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(': connected\n\n');
    clients.add(res);
    codex.start();
    req.on('close', () => clients.delete(res));
  });

  app.post('/codex/rpc', requireToken, async (req: Request, res: Response) => {
    const { method, params } = req.body ?? {};
    try {
      const result = await codex.request(method, params);
      res.json({ result });
    } catch (error) {
      res.json({ error: { message: error instanceof Error ? error.message : String(error) } });
    }
  });

  app.post('/codex/notify', requireToken, (req: Request, res: Response) => {
    const { method, params } = req.body ?? {};
    codex.notify(method, params);
    res.status(204).end();
  });

  app.post('/codex/respond', requireToken, (req: Request, res: Response) => {
    const { id, result } = req.body ?? {};
    codex.respond(id, result);
    res.status(204).end();
  });

  let closeVite: (() => Promise<void>) | null = null;

  if (options.mode === 'dev') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.resolve(root, 'config/vite/vite.renderer.config.mts'),
      root,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    closeVite = () => vite.close();
  } else {
    const staticDir = options.staticDir ?? path.resolve(root, 'dist-web');
    app.use(express.static(staticDir));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));

  return {
    url: `http://${options.host}:${options.port}/`,
    close: async () => {
      codex.stop();
      await closeVite?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

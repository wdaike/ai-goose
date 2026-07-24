import type { CodexAPI } from '../preload';

type EventHandler = (msg: unknown) => void;

/**
 * Backs `window.codex` in the browser by talking to the web host over plain
 * HTTP: request/notify/respond are POSTs, and codex→client messages arrive on a
 * Server-Sent Events stream. It exposes the exact same four verbs as the
 * desktop IPC bridge, so nothing above it — the codex client façade or the chat
 * engine — can tell which transport it is running on.
 */
class BrowserCodex implements CodexAPI {
  private readonly handlers = new Set<EventHandler>();

  constructor(
    private readonly base: string,
    private readonly token: string | null
  ) {
    this.openStream();
  }

  private withToken(path: string): string {
    if (!this.token) return `${this.base}${path}`;
    const separator = path.includes('?') ? '&' : '?';
    return `${this.base}${path}${separator}token=${encodeURIComponent(this.token)}`;
  }

  private openStream(): void {
    const source = new EventSource(this.withToken('/events'));
    source.onmessage = (event) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.emit(msg);
    };
    // EventSource reconnects on its own; surface the gap so recovery-aware UI
    // (and the codex client) sees the same `goose/codexExited` signal the
    // desktop bridge emits when the app-server drops.
    source.onerror = () => {
      this.emit({ method: 'goose/codexExited', params: { code: null, signal: null } });
    };
  }

  private emit(msg: unknown): void {
    for (const handler of this.handlers) handler(msg);
  }

  private async post(path: string, body: unknown): Promise<Response> {
    return fetch(this.withToken(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const response = await this.post('/rpc', { method, params });
    if (!response.ok) {
      throw new Error(`codex ${method}: host returned ${response.status}`);
    }
    const payload = (await response.json()) as { result?: unknown; error?: { message: string } };
    if (payload.error) throw new Error(payload.error.message);
    return payload.result;
  }

  notify(method: string, params: unknown): void {
    void this.post('/notify', { method, params });
  }

  respond(id: number | string, result: unknown): void {
    void this.post('/respond', { id, result });
  }

  onEvent(handler: (msg: unknown) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export function installBrowserCodex(base: string, token: string | null): void {
  if (window.codex) return;
  window.codex = new BrowserCodex(base, token);
}

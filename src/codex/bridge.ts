import { BrowserWindow, ipcMain } from 'electron';
import { CodexProcess, CODEX_HOME, type JsonRpcMessage } from './codexProcess';
import log from '../utils/logger';

type JsonRpcId = number | string;

export { CODEX_HOME };

/**
 * Bridges a `codex app-server` process to the renderer over Electron IPC. All
 * transport lives in `CodexProcess`; this adapter only fans server-initiated
 * messages out to every window and exposes the renderer's request/notify/
 * respond calls as IPC handlers.
 */
export class CodexBridge {
  private readonly codex = new CodexProcess((msg) => this.broadcast(msg), log);

  start(): void {
    this.codex.start();
  }

  stop(): void {
    this.codex.stop();
  }

  private broadcast(msg: JsonRpcMessage): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('codex:event', msg);
    }
  }

  request(method: string, params: unknown): Promise<unknown> {
    return this.codex.request(method, params);
  }

  notify(method: string, params: unknown): void {
    this.codex.notify(method, params);
  }

  respond(id: JsonRpcId, result: unknown): void {
    this.codex.respond(id, result);
  }
}

export function registerCodexBridge(): CodexBridge {
  const bridge = new CodexBridge();
  ipcMain.handle('codex:request', (_event, method: string, params: unknown) =>
    bridge.request(method, params)
  );
  ipcMain.on('codex:notify', (_event, method: string, params: unknown) => {
    bridge.notify(method, params);
  });
  ipcMain.on('codex:respond', (_event, id: JsonRpcId, result: unknown) => {
    bridge.respond(id, result);
  });
  return bridge;
}

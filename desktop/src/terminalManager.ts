import { ipcMain, type WebContents } from 'electron';
import os from 'node:os';
import * as pty from 'node-pty';
import { expandTilde } from './utils/pathUtils';
import log from './utils/logger';

interface TerminalSession {
  pty: pty.IPty;
  sender: WebContents;
}

const sessions = new Map<string, TerminalSession>();
let nextId = 1;

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
}

export function registerTerminalManager(): void {
  ipcMain.handle(
    'terminal:create',
    (event, options: { cwd?: string; cols?: number; rows?: number }) => {
      const id = `term-${nextId++}`;
      const shell = defaultShell();
      const cwd = options.cwd ? expandTilde(options.cwd) : os.homedir();

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: options.cols ?? 80,
        rows: options.rows ?? 24,
        cwd,
        env: { ...process.env, TERM_PROGRAM: 'goose' } as Record<string, string>,
      });

      const sender = event.sender;
      sessions.set(id, { pty: ptyProcess, sender });

      ptyProcess.onData((data) => {
        if (!sender.isDestroyed()) {
          sender.send('terminal:data', id, data);
        }
      });

      ptyProcess.onExit(({ exitCode }) => {
        sessions.delete(id);
        if (!sender.isDestroyed()) {
          sender.send('terminal:exit', id, exitCode);
        }
      });

      sender.once('destroyed', () => {
        const session = sessions.get(id);
        if (session) {
          sessions.delete(id);
          try {
            session.pty.kill();
          } catch (error) {
            log.info(`Failed to kill terminal ${id}: ${error}`);
          }
        }
      });

      return id;
    }
  );

  ipcMain.on('terminal:input', (_event, id: string, data: string) => {
    sessions.get(id)?.pty.write(data);
  });

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) {
      sessions.get(id)?.pty.resize(cols, rows);
    }
  });

  ipcMain.on('terminal:kill', (_event, id: string) => {
    const session = sessions.get(id);
    if (session) {
      sessions.delete(id);
      try {
        session.pty.kill();
      } catch (error) {
        log.info(`Failed to kill terminal ${id}: ${error}`);
      }
    }
  });
}

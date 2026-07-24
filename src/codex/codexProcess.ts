import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';

type JsonRpcId = number | string;

export interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface JsonRpcMessage {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  method: string;
}

export const CODEX_HOME = path.join(os.homedir(), '.goose');
const LEGACY_GOOSE_CONFIG = path.join(os.homedir(), '.config', 'goose', 'config.yaml');

function tomlString(value: string): string {
  return JSON.stringify(value);
}

interface LegacyExtension {
  enabled?: boolean;
  type?: string;
  uri?: string;
  cmd?: string;
  args?: string[];
  headers?: Record<string, string>;
  timeout?: number;
}

interface LegacyGooseConfig {
  active_provider?: string;
  providers?: Record<string, { enabled?: boolean; model?: string }>;
  extensions?: Record<string, LegacyExtension>;
  GOOSE_THINKING_EFFORT?: string;
}

const EFFORT_MAP: Record<string, string> = {
  off: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'xhigh',
};

const KNOWN_PROVIDERS: Record<string, { name: string; baseUrl: string; envKey: string }> = {
  alibaba: {
    name: 'Alibaba Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'DASHSCOPE_API_KEY',
  },
};

/**
 * Builds `~/.goose/config.toml` from the legacy goose config so a first
 * launch works without manual setup. Runs only when the file is absent.
 */
function migrateLegacyConfig(): string {
  let legacy: LegacyGooseConfig = {};
  try {
    legacy = yaml.parse(fs.readFileSync(LEGACY_GOOSE_CONFIG, 'utf8')) ?? {};
  } catch {
    // No legacy config to migrate; still emit the defaults below.
  }

  const lines: string[] = ['web_search = "live"'];

  const effort = EFFORT_MAP[legacy.GOOSE_THINKING_EFFORT ?? ''];
  if (effort) lines.push(`model_reasoning_effort = ${tomlString(effort)}`);

  const providerId = legacy.active_provider;
  const provider = providerId ? KNOWN_PROVIDERS[providerId] : undefined;
  const providerModel = providerId ? legacy.providers?.[providerId]?.model : undefined;
  if (provider && providerModel) {
    lines.push(`model = ${tomlString(providerModel)}`);
    lines.push(`model_provider = ${tomlString(providerId!)}`);
    lines.push('');
    lines.push(`[model_providers.${providerId}]`);
    lines.push(`name = ${tomlString(provider.name)}`);
    lines.push(`base_url = ${tomlString(provider.baseUrl)}`);
    lines.push(`env_key = ${tomlString(provider.envKey)}`);
    lines.push(`wire_api = "responses"`);
  }

  for (const [name, extension] of Object.entries(legacy.extensions ?? {})) {
    if (!extension.enabled) continue;
    if (extension.type === 'streamable_http' && extension.uri) {
      lines.push('');
      lines.push(`[mcp_servers.${name}]`);
      lines.push(`url = ${tomlString(extension.uri)}`);
      const headers = Object.entries(extension.headers ?? {});
      if (headers.length) {
        const rendered = headers
          .map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`)
          .join(', ');
        lines.push(`http_headers = { ${rendered} }`);
      }
      if (extension.timeout) lines.push(`startup_timeout_sec = ${extension.timeout}`);
    } else if (extension.type === 'stdio' && extension.cmd) {
      lines.push('');
      lines.push(`[mcp_servers.${name}]`);
      lines.push(`command = ${tomlString(extension.cmd)}`);
      if (extension.args?.length) {
        lines.push(`args = [${extension.args.map(tomlString).join(', ')}]`);
      }
      if (extension.timeout) lines.push(`startup_timeout_sec = ${extension.timeout}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function ensureCodexHome(logger: Logger = console): string {
  fs.mkdirSync(CODEX_HOME, { recursive: true });

  const configPath = path.join(CODEX_HOME, 'config.toml');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, migrateLegacyConfig());
    logger.info(`Created ${configPath} from legacy goose config`);
  }

  return CODEX_HOME;
}

export type ServerMessageSink = (msg: JsonRpcMessage) => void;

/**
 * Spawns `codex app-server` and speaks its stdio JSONL JSON-RPC. This class is
 * the single transport core shared by every host: it handles the subprocess,
 * request correlation, and forwarding server-initiated messages. It is free of
 * any Electron/HTTP concern — the host supplies an `onServerMessage` sink that
 * decides how codex→client requests and notifications reach the renderer
 * (Electron IPC in the desktop app, a WebSocket in the web host).
 */
export class CodexProcess {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();
  private initialized: Promise<unknown> | null = null;

  constructor(
    private readonly onServerMessage: ServerMessageSink,
    private readonly logger: Logger = console
  ) {}

  start(): void {
    if (this.child) return;
    const bin = process.env.GOOSE_CODEX_BIN ?? 'codex';
    const codexHome = ensureCodexHome(this.logger);
    const child = spawn(bin, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    this.child = child;

    child.on('exit', (code, signal) => {
      this.logger.error(`codex app-server exited code=${code} signal=${signal}`);
      const error = new Error(`codex app-server exited (code=${code})`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.child = null;
      this.initialized = null;
      this.onServerMessage({ method: 'goose/codexExited', params: { code, signal } });
    });

    child.stderr?.on('data', (data: Buffer) => {
      this.logger.info(`[codex] ${data.toString().trimEnd()}`);
    });

    const lines = createInterface({ input: child.stdout! });
    lines.on('line', (line) => this.onLine(line));

    this.initialized = this.request('initialize', {
      clientInfo: {
        name: 'goose',
        title: 'goose',
        version: process.env.npm_package_version ?? '0.0.0',
      },
      capabilities: { experimentalApi: true },
    }).then((result) => {
      this.notify('initialized', undefined);
      return result;
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }

  private onLine(line: string): void {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line);
    } catch {
      this.logger.error(`codex app-server: unparseable line: ${line.slice(0, 200)}`);
      return;
    }

    if (msg.id !== undefined && msg.method === undefined) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(`${pending.method}: ${JSON.stringify(msg.error)}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Server -> client requests (approvals, elicitations) and notifications
    // both flow through the sink; the host answers requests via `respond`.
    this.onServerMessage(msg);
  }

  private send(msg: JsonRpcMessage): void {
    if (!this.child?.stdin) throw new Error('codex app-server not running');
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  async request(method: string, params: unknown): Promise<unknown> {
    if (method !== 'initialize') {
      this.start();
      await this.initialized;
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.send({ id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ method, params });
  }

  respond(id: JsonRpcId, result: unknown): void {
    this.send({ id, result });
  }
}

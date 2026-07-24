import type { ExtensionConfig, ExtensionEntry } from '../types/extensions';
import type { GooseExtension, GooseExtensionEntry } from '../types/goose';
import { codex } from '../codex/client';
import type { JsonValue } from '../codex/protocol/serde_json/JsonValue';

export type ConfiguredExtensionEntry = ExtensionEntry & { configKey?: string };

export interface ConfiguredExtensionsResponse {
  extensions: ConfiguredExtensionEntry[];
  warnings: string[];
}

export function gooseExtensionName(extension: GooseExtension): string {
  return extension.type === 'mcp' ? extension.server.name : extension.name;
}

interface CodexMcpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  http_headers?: Record<string, string>;
  enabled?: boolean;
  startup_timeout_sec?: number;
}

async function readMcpServers(): Promise<Record<string, CodexMcpServer>> {
  const response = await codex.configRead({ includeLayers: true });
  const merged: Record<string, CodexMcpServer> = {};
  for (const layer of response.layers ?? []) {
    const layerConfig = layer.config as { mcp_servers?: Record<string, CodexMcpServer> } | null;
    Object.assign(merged, layerConfig?.mcp_servers ?? {});
  }
  return merged;
}

function serverToEntry(name: string, server: CodexMcpServer): ConfiguredExtensionEntry | null {
  const enabled = server.enabled !== false;
  if (server.command) {
    return {
      type: 'stdio',
      name,
      description: '',
      cmd: server.command,
      args: server.args ?? [],
      env_keys: Object.keys(server.env ?? {}),
      timeout: server.startup_timeout_sec,
      enabled,
      configKey: name,
    };
  }
  if (server.url) {
    return {
      type: 'streamable_http',
      name,
      description: '',
      uri: server.url,
      headers: server.http_headers ?? {},
      env_keys: [],
      timeout: server.startup_timeout_sec,
      enabled,
      configKey: name,
    };
  }
  return null;
}

export async function getConfiguredGooseExtensions(): Promise<GooseExtensionEntry[]> {
  // Codex owns MCP server startup; nothing to inject at session creation.
  return [];
}

export async function getConfiguredExtensions(): Promise<ConfiguredExtensionsResponse> {
  const servers = await readMcpServers();
  return {
    extensions: Object.entries(servers)
      .map(([name, server]) => serverToEntry(name, server))
      .filter((entry): entry is ConfiguredExtensionEntry => entry !== null),
    warnings: [],
  };
}

export function extensionConfigToGooseExtension(_config: ExtensionConfig): GooseExtension | null {
  return null;
}

function extensionConfigToCodexServer(config: ExtensionConfig): CodexMcpServer | null {
  switch (config.type) {
    case 'stdio':
      return {
        command: config.cmd,
        args: config.args ?? [],
        ...(config.timeout ? { startup_timeout_sec: config.timeout } : {}),
      };
    case 'streamable_http':
      return {
        url: config.uri,
        ...(Object.keys(config.headers ?? {}).length ? { http_headers: config.headers } : {}),
        ...(config.timeout ? { startup_timeout_sec: config.timeout } : {}),
      };
    default:
      return null;
  }
}

async function writeMcpServer(name: string, value: CodexMcpServer | null): Promise<void> {
  await codex.configBatchWrite({
    edits: [{ keyPath: `mcp_servers.${name}`, value: value as JsonValue, mergeStrategy: 'replace' }],
    reloadUserConfig: true,
  });
}

export async function addConfigExtension(config: ExtensionConfig, enabled: boolean): Promise<void> {
  const server = extensionConfigToCodexServer(config);
  if (!server) {
    throw new Error(`Unsupported extension type for codex: ${config.type}`);
  }
  await writeMcpServer(config.name, { ...server, ...(enabled ? {} : { enabled: false }) });
}

export async function removeConfigExtension(configKey: string): Promise<void> {
  await writeMcpServer(configKey, null);
}

export async function setConfigExtensionEnabled(
  configKey: string,
  enabled: boolean
): Promise<void> {
  await codex.configBatchWrite({
    edits: [
      { keyPath: `mcp_servers.${configKey}.enabled`, value: enabled, mergeStrategy: 'upsert' },
    ],
    reloadUserConfig: true,
  });
}

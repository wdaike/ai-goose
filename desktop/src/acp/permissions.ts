import type { ToolListItem, ToolPermissionEntry, ToolPermissionLevel } from '@aaif/goose-sdk';
import { codex } from '../codex/client';

export type { ToolListItem, ToolPermissionEntry, ToolPermissionLevel };

export async function listTools(
  _sessionId: string,
  extensionName?: string
): Promise<ToolListItem[]> {
  const response = await codex.mcpServerStatusList({});
  return response.data
    .filter((server) => !extensionName || server.name === extensionName)
    .flatMap((server) =>
      Object.entries(server.tools).map(([toolName, tool]) => ({
        name: `${server.name}__${toolName}`,
        description: tool?.description ?? '',
      }))
    ) as ToolListItem[];
}

export async function setToolPermissions(_toolPermissions: ToolPermissionEntry[]): Promise<void> {}

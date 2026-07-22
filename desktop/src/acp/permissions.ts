import type { ToolListItem, ToolPermissionEntry, ToolPermissionLevel } from '@aaif/goose-sdk';

export type { ToolListItem, ToolPermissionEntry, ToolPermissionLevel };

interface McpServerStatusEntry {
  name: string;
  tools: Record<string, { description?: string | null } | undefined>;
}

export async function listTools(
  _sessionId: string,
  extensionName?: string
): Promise<ToolListItem[]> {
  const response = (await window.codex.request('mcpServerStatus/list', {})) as {
    data: McpServerStatusEntry[];
  };
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

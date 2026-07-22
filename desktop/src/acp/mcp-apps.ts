import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolListItem } from '@aaif/goose-sdk';
import type { GooseApp } from '../types/apps';

export type McpAppTool = ToolListItem;
export type McpAppResourceResponse = {
  uri: string;
  mimeType: string | null;
  text: string;
  _meta?: Record<string, unknown>;
};

// MCP apps are surfaced by codex (`app/list`); the desktop UI integration is
// not wired up yet in the codex-backed experimental build.
export async function listMcpApps(_sessionId?: string): Promise<GooseApp[]> {
  return [];
}

export async function exportMcpApp(_name: string): Promise<string> {
  throw new Error('MCP apps are not available');
}

export async function importMcpApp(_html: string): Promise<void> {
  throw new Error('MCP apps are not available');
}

export async function deleteMcpApp(_name: string): Promise<void> {}

export async function listMcpAppTools(
  _sessionId: string,
  _extensionName?: string
): Promise<McpAppTool[]> {
  return [];
}

export async function readMcpAppResource(
  _sessionId: string,
  _extensionName: string,
  _uri: string
): Promise<McpAppResourceResponse> {
  throw new Error('MCP apps are not available');
}

export async function callMcpAppTool(
  _sessionId: string,
  _extensionName: string,
  _toolName: string,
  _args?: Record<string, unknown>
): Promise<CallToolResult> {
  throw new Error('MCP apps are not available');
}

import { describe, expect, it } from 'vitest';
import {
  callMcpAppTool,
  deleteMcpApp,
  exportMcpApp,
  importMcpApp,
  listMcpApps,
  listMcpAppTools,
  readMcpAppResource,
} from '../mcp-apps';

// MCP apps are surfaced by codex (`app/list`); the desktop integration is not
// wired up yet, so the helpers are stubs with a fixed contract.
describe('MCP app stubs (codex bridge)', () => {
  it('lists no apps or tools', async () => {
    await expect(listMcpApps('session-1')).resolves.toEqual([]);
    await expect(listMcpAppTools('session-1', 'weather')).resolves.toEqual([]);
  });

  it('treats delete as a no-op', async () => {
    await expect(deleteMcpApp('weather')).resolves.toBeUndefined();
  });

  it('rejects operations that require the removed backend', async () => {
    await expect(exportMcpApp('weather')).rejects.toThrow('MCP apps are not available');
    await expect(importMcpApp('<html></html>')).rejects.toThrow('MCP apps are not available');
    await expect(readMcpAppResource('session-1', 'weather', 'ui://weather/panel')).rejects.toThrow(
      'MCP apps are not available'
    );
    await expect(callMcpAppTool('session-1', 'weather', 'refresh')).rejects.toThrow(
      'MCP apps are not available'
    );
  });
});

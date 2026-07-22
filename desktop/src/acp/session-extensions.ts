import type { ExtensionConfig } from '../types/extensions';
import {
  addConfigExtension,
  getConfiguredExtensions,
  setConfigExtensionEnabled,
} from './extensions';

// Codex owns MCP servers globally; session-scoped extension state maps onto
// the global config.
export async function getSessionExtensions(_sessionId: string): Promise<ExtensionConfig[]> {
  const { extensions } = await getConfiguredExtensions();
  return extensions
    .filter((entry) => entry.enabled)
    .map(({ enabled: _enabled, configKey: _configKey, ...config }) => config as ExtensionConfig);
}

export async function addSessionExtension(
  _sessionId: string,
  config: ExtensionConfig
): Promise<void> {
  await addConfigExtension(config, true);
}

export async function removeSessionExtension(_sessionId: string, name: string): Promise<void> {
  await setConfigExtensionEnabled(name, false);
}

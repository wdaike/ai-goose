import { codex } from '../client';
import type { PluginDetail } from '../protocol/v2/PluginDetail';
import type { PluginMarketplaceEntry } from '../protocol/v2/PluginMarketplaceEntry';
import type { MarketplaceLoadErrorInfo } from '../protocol/v2/MarketplaceLoadErrorInfo';

export interface PluginListing {
  marketplaces: PluginMarketplaceEntry[];
  loadErrors: MarketplaceLoadErrorInfo[];
}

export async function listPlugins(cwd: string): Promise<PluginListing> {
  const response = await codex.pluginList({ cwds: cwd ? [cwd] : [] });
  return { marketplaces: response.marketplaces, loadErrors: response.marketplaceLoadErrors };
}

/**
 * Enables or disables an installed plugin by writing `plugins."<id>".enabled`.
 * The id (e.g. `documents@openai-primary-runtime`) is quoted so its `@`/`-`
 * characters survive the dotted key-path parser. Reloads the config into loaded
 * threads so the change takes effect without a restart.
 */
export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  await codex.configBatchWrite({
    edits: [
      { keyPath: `plugins.${JSON.stringify(id)}.enabled`, value: enabled, mergeStrategy: 'upsert' },
    ],
    reloadUserConfig: true,
  });
}

/** Local marketplaces are addressed by snapshot path, remote ones by name. */
function pluginRef(marketplace: PluginMarketplaceEntry, pluginName: string) {
  return marketplace.path
    ? { marketplacePath: marketplace.path, pluginName }
    : { remoteMarketplaceName: marketplace.name, pluginName };
}

export async function installPlugin(
  marketplace: PluginMarketplaceEntry,
  pluginName: string
): Promise<void> {
  await codex.pluginInstall(pluginRef(marketplace, pluginName));
}

/** Everything a plugin bundles: skills, hooks, apps, MCP servers, scheduled tasks. */
export async function readPlugin(
  marketplace: PluginMarketplaceEntry,
  pluginName: string
): Promise<PluginDetail> {
  const response = await codex.pluginRead(pluginRef(marketplace, pluginName));
  return response.plugin;
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  await codex.pluginUninstall({ pluginId });
}

export async function addMarketplace(source: string): Promise<string> {
  const response = await codex.marketplaceAdd({ source });
  return response.marketplaceName;
}

export async function removeMarketplace(marketplaceName: string): Promise<void> {
  await codex.marketplaceRemove({ marketplaceName });
}

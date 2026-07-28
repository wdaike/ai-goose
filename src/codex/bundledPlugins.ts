import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from './codexProcess';
import type { MarketplaceAddResponse } from './protocol/v2/MarketplaceAddResponse';
import type { PluginListResponse } from './protocol/v2/PluginListResponse';

const MARKER = '.bundled_marketplace';
const MARKETPLACE_DIR = path.join('marketplaces', 'openai-bundled');

type Request = (method: string, params: unknown) => Promise<unknown>;

function installable(policy: string, availability: string): boolean {
  return policy !== 'NOT_AVAILABLE' && availability === 'AVAILABLE';
}

async function provision(
  request: Request,
  codexHome: string,
  seedDir: string,
  logger: Logger
): Promise<void> {
  // Copied out of the read-only app resources so codex owns a writable
  // marketplace under CODEX_HOME, the same shape as openai-primary-runtime.
  const source = path.join(codexHome, MARKETPLACE_DIR);
  fs.rmSync(source, { recursive: true, force: true });
  fs.cpSync(path.join(seedDir, MARKETPLACE_DIR), source, { recursive: true });

  const added = (await request('marketplace/add', { source })) as MarketplaceAddResponse;

  const listing = (await request('plugin/list', { cwds: [] })) as PluginListResponse;
  const marketplace = listing.marketplaces.find((entry) => entry.name === added.marketplaceName);
  if (!marketplace?.path) throw new Error(`${added.marketplaceName} missing from plugin/list`);

  const pending = marketplace.plugins.filter(
    (plugin) => !plugin.installed && installable(plugin.installPolicy, plugin.availability)
  );
  for (const plugin of pending) {
    await request('plugin/install', {
      marketplacePath: marketplace.path,
      pluginName: plugin.name,
    });
    logger.info(`Installed bundled plugin ${plugin.name}`);
  }

  fs.writeFileSync(path.join(codexHome, MARKER), added.marketplaceName);
}

/**
 * Seeds icodex's CODEX_HOME with the plugin marketplace vendored under
 * `codex-seed` — browser, chrome, computer-use, sites, visualize, latex and
 * record-and-replay. They are not in the official marketplace
 * (`github.com/openai/plugins`) and no runtime downloads them, so shipping them
 * in our own resources is what keeps first run independent of an installed
 * Codex desktop app.
 *
 * The marker makes this first-run only, so a plugin the user later uninstalls
 * stays uninstalled.
 */
export async function ensureBundledPlugins(
  request: Request,
  codexHome: string,
  seedDir: string,
  logger: Logger
): Promise<void> {
  if (fs.existsSync(path.join(codexHome, MARKER))) return;
  try {
    await provision(request, codexHome, seedDir, logger);
  } catch (error) {
    logger.error(`Bundled plugin provisioning failed: ${String(error)}`);
  }
}

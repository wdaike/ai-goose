import { codex } from '../client';
import type { AppInfo } from '../protocol/v2/AppInfo';

export async function listApps(): Promise<AppInfo[]> {
  const response = await codex.appList({});
  return response.data;
}

/**
 * Enables or disables a connector by writing `apps."<id>".enabled`. The id is
 * quoted so ids carrying `.`/`-` survive the dotted key-path parser, matching
 * how plugins are toggled. Reloads the config so loaded threads pick the change
 * up without a restart.
 */
export async function setAppEnabled(id: string, enabled: boolean): Promise<void> {
  await codex.configBatchWrite({
    edits: [
      { keyPath: `apps.${JSON.stringify(id)}.enabled`, value: enabled, mergeStrategy: 'upsert' },
    ],
    reloadUserConfig: true,
  });
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codex } from '../client';
import type { PluginDetail } from '../protocol/v2/PluginDetail';
import type { PluginMarketplaceEntry } from '../protocol/v2/PluginMarketplaceEntry';
import { readPlugin } from './pluginCatalog';

vi.mock('../client', () => ({
  codex: {
    pluginRead: vi.fn(),
    skillsList: vi.fn(),
  },
}));

const marketplace = {
  name: 'openai-primary-runtime',
  path: '/Users/test/.icodex/marketplaces/openai-primary-runtime/marketplace.json',
} as PluginMarketplaceEntry;

function pluginDetail(installed: boolean): PluginDetail {
  return {
    summary: { installed } as PluginDetail['summary'],
    skills: [
      {
        name: 'pdf:pdf',
        description: 'Marketplace description',
        shortDescription: null,
        interface: null,
        path: '/Users/test/.icodex/marketplaces/openai-primary-runtime/plugins/pdf/skills/pdf/SKILL.md',
        enabled: true,
      },
    ],
  } as PluginDetail;
}

describe('plugin catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the runtime-resolved path for skills in an installed plugin', async () => {
    vi.mocked(codex.pluginRead).mockResolvedValue({ plugin: pluginDetail(true) });
    vi.mocked(codex.skillsList).mockResolvedValue({
      data: [
        {
          cwd: '/workspace',
          errors: [],
          skills: [
            {
              name: 'pdf:pdf',
              description: 'Installed description',
              path: '/Users/test/.icodex/plugins/cache/openai-primary-runtime/pdf/1.0.0/skills/pdf/SKILL.md',
              scope: 'user',
              enabled: true,
            },
          ],
        },
      ],
    });

    const detail = await readPlugin(marketplace, 'pdf', '/workspace');

    expect(detail.skills[0]).toMatchObject({
      description: 'Installed description',
      path: '/Users/test/.icodex/plugins/cache/openai-primary-runtime/pdf/1.0.0/skills/pdf/SKILL.md',
    });
    expect(codex.skillsList).toHaveBeenCalledWith({
      cwds: ['/workspace'],
      forceReload: true,
    });
  });

  it('keeps marketplace paths when previewing an uninstalled plugin', async () => {
    const detail = pluginDetail(false);
    vi.mocked(codex.pluginRead).mockResolvedValue({ plugin: detail });

    await expect(readPlugin(marketplace, 'pdf', '/workspace')).resolves.toBe(detail);
    expect(codex.skillsList).not.toHaveBeenCalled();
  });
});

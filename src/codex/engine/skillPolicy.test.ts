import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codex } from '../client';
import type { SkillMetadata } from '../protocol/v2/SkillMetadata';
import { enforceSkillPolicy, listManagedSkills } from './skillPolicy';

vi.mock('../client', () => ({
  codex: {
    configRead: vi.fn(),
    skillsList: vi.fn(),
    skillsConfigWrite: vi.fn(),
  },
}));

const managedSkill: SkillMetadata = {
  name: 'documents',
  description: 'Create documents',
  path: '/Users/test/.icodex/skills/documents/SKILL.md',
  scope: 'user',
  enabled: true,
};

const externalSkill: SkillMetadata = {
  name: 'repo-review',
  description: 'Review a repository',
  path: '/workspace/.codex/skills/repo-review/SKILL.md',
  scope: 'repo',
  enabled: true,
};

function skillsResponse(skills: SkillMetadata[]) {
  return {
    data: [{ cwd: '/workspace', skills, errors: [] }],
  };
}

describe('skill policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.appConfig = {
      get: vi.fn(() => undefined),
      getAll: vi.fn(() => ({})),
    };
    vi.mocked(codex.skillsConfigWrite).mockResolvedValue({ effectiveEnabled: false });
  });

  it('resolves CODEX_HOME from the app-server user config layer in the web app', async () => {
    vi.mocked(codex.configRead).mockResolvedValue({
      config: {} as never,
      origins: {},
      layers: [
        {
          name: {
            type: 'user',
            file: '/Users/test/.icodex/config.toml',
            profile: null,
          },
          version: '1',
          config: {},
          disabledReason: null,
        },
      ],
    });
    vi.mocked(codex.skillsList).mockResolvedValue(skillsResponse([managedSkill, externalSkill]));

    await expect(enforceSkillPolicy('/workspace')).resolves.toEqual([managedSkill]);
    expect(codex.skillsConfigWrite).toHaveBeenCalledOnce();
    expect(codex.skillsConfigWrite).toHaveBeenCalledWith({
      path: externalSkill.path,
      enabled: false,
    });
  });

  it('does not disable skills when CODEX_HOME cannot be resolved', async () => {
    vi.mocked(codex.configRead).mockRejectedValue(new Error('unavailable'));
    vi.mocked(codex.skillsList).mockResolvedValue(skillsResponse([managedSkill, externalSkill]));

    await expect(enforceSkillPolicy('/workspace')).resolves.toEqual([managedSkill, externalSkill]);
    expect(codex.skillsConfigWrite).not.toHaveBeenCalled();
  });

  it('uses the resolved app-server home when listing managed skills', async () => {
    vi.mocked(codex.configRead).mockResolvedValue({
      config: {} as never,
      origins: {},
      layers: [
        {
          name: {
            type: 'user',
            file: 'C:\\Users\\test\\.icodex\\config.toml',
            profile: null,
          },
          version: '1',
          config: {},
          disabledReason: null,
        },
      ],
    });
    vi.mocked(codex.skillsList).mockResolvedValue(
      skillsResponse([
        {
          ...managedSkill,
          path: 'C:\\Users\\test\\.icodex\\skills\\documents\\SKILL.md',
        },
        externalSkill,
      ])
    );

    await expect(listManagedSkills('/workspace')).resolves.toHaveLength(1);
  });
});

import type { SourceEntry } from '@aaif/goose-sdk';

export async function listSkillSources(projectDir: string): Promise<SourceEntry[]> {
  const response = (await window.codex.request('skills/list', {
    cwds: [projectDir],
  })) as {
    data: Array<{
      skills: Array<{ name: string; description: string; path: string; enabled: boolean }>;
    }>;
  };
  return response.data
    .flatMap((entry) => entry.skills)
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      type: 'skill',
      name: skill.name,
      description: skill.description,
      content: '',
      path: skill.path,
    })) as SourceEntry[];
}

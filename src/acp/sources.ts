import type { SourceEntry } from '../types/goose';
import { enforceSkillPolicy } from '../codex/engine/skillPolicy';

export async function listSkillSources(projectDir: string): Promise<SourceEntry[]> {
  const skills = await enforceSkillPolicy(projectDir);
  return skills.map((skill) => ({
    type: 'skill',
    name: skill.name,
    description: skill.description,
    content: '',
    path: skill.path,
  })) as SourceEntry[];
}

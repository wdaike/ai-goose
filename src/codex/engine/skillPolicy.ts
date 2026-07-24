import { codex } from '../client';
import type { SkillMetadata } from '../protocol/v2/SkillMetadata';

function codexHome(): string {
  return (window.appConfig?.get('GOOSE_CODEX_HOME') as string) ?? '';
}

function isUnderCodexHome(skillPath: string, home: string): boolean {
  return home !== '' && (skillPath.startsWith(`${home}/`) || skillPath.startsWith(`${home}\\`));
}

/**
 * Codex discovers skills outside CODEX_HOME (`~/.agents/skills`, repo-level
 * `.codex/skills` and `.agents/skills`, `/etc/codex/skills`) and offers no
 * config switch to turn that discovery off. Goose must only use skills from
 * `~/.goose`, so anything else gets disabled via `skills/config/write`.
 * Returns the enabled skills that survive the policy.
 */
export async function enforceSkillPolicy(cwd: string): Promise<SkillMetadata[]> {
  const home = codexHome();
  const response = await codex.skillsList({ cwds: cwd ? [cwd] : [] });
  const skills = response.data.flatMap((entry) => entry.skills);
  const external = skills.filter((skill) => skill.enabled && !isUnderCodexHome(skill.path, home));
  await Promise.all(
    external.map((skill) => codex.skillsConfigWrite({ path: skill.path, enabled: false }))
  );
  return skills.filter((skill) => skill.enabled && isUnderCodexHome(skill.path, home));
}

/**
 * Skills goose manages: everything under CODEX_HOME, enabled or not, so
 * settings can list and toggle them.
 */
export async function listManagedSkills(cwd: string): Promise<SkillMetadata[]> {
  const home = codexHome();
  const response = await codex.skillsList({ cwds: cwd ? [cwd] : [], forceReload: true });
  const skills = response.data.flatMap((entry) => entry.skills);
  return skills.filter((skill) => isUnderCodexHome(skill.path, home));
}

export async function setSkillEnabled(path: string, enabled: boolean): Promise<void> {
  await codex.skillsConfigWrite({ path, enabled });
}

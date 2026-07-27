import { codex } from '../client';
import type { SkillMetadata } from '../protocol/v2/SkillMetadata';

function parentPath(filePath: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return separatorIndex > 0 ? filePath.slice(0, separatorIndex) : '';
}

async function codexHome(): Promise<string> {
  const configuredHome = window.appConfig?.get('CODEX_HOME');
  if (typeof configuredHome === 'string' && configuredHome.trim()) {
    return configuredHome;
  }

  const response = await codex.configRead({ includeLayers: true });
  const userLayer = response.layers?.find((layer) => layer.name.type === 'user');
  return userLayer?.name.type === 'user' ? parentPath(userLayer.name.file) : '';
}

function isUnderDirectory(filePath: string, directory: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedDirectory = directory.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalizedDirectory !== '' && normalizedPath.startsWith(`${normalizedDirectory}/`);
}

function isUnderCodexHome(skillPath: string, home: string): boolean {
  return isUnderDirectory(skillPath, home);
}

/**
 * Codex discovers skills outside CODEX_HOME (`~/.agents/skills`, repo-level
 * `.codex/skills` and `.agents/skills`, `/etc/codex/skills`) and offers no
 * config switch to turn that discovery off. Goose must only use skills from
 * `~/.icodex`, so anything else gets disabled via `skills/config/write`.
 * Returns the enabled skills that survive the policy.
 */
export async function enforceSkillPolicy(cwd: string): Promise<SkillMetadata[]> {
  const [home, response] = await Promise.all([
    codexHome().catch(() => ''),
    codex.skillsList({ cwds: cwd ? [cwd] : [] }),
  ]);
  const skills = response.data.flatMap((entry) => entry.skills);
  if (!home) {
    console.warn('Could not resolve CODEX_HOME; skipping external skill policy');
    return skills.filter((skill) => skill.enabled);
  }
  const external = skills.filter((skill) => skill.enabled && !isUnderCodexHome(skill.path, home));
  await Promise.all(
    external.map((skill) => codex.skillsConfigWrite({ path: skill.path, enabled: false }))
  );
  return skills.filter((skill) => skill.enabled && isUnderCodexHome(skill.path, home));
}

/**
 * Skills shown in settings are the ones under CODEX_HOME/skills.
 */
export async function listManagedSkills(cwd: string): Promise<SkillMetadata[]> {
  const [home, response] = await Promise.all([
    codexHome(),
    codex.skillsList({ cwds: cwd ? [cwd] : [], forceReload: true }),
  ]);
  const skills = response.data.flatMap((entry) => entry.skills);
  return skills.filter((skill) => isUnderDirectory(skill.path, `${home}/skills`));
}

export async function setSkillEnabled(path: string, enabled: boolean): Promise<void> {
  await codex.skillsConfigWrite({ path, enabled });
}

/** Directory holding a skill's SKILL.md, references and scripts. */
export function skillDirectory(skillPath: string): string {
  return parentPath(skillPath);
}

/**
 * Standalone skills the user installed live directly under this root; codex's
 * own `.system` skills and the ones a plugin ships are managed elsewhere and
 * must not be deleted from disk.
 */
export async function personalSkillsRoot(): Promise<string> {
  return `${await codexHome()}/skills`;
}

export async function uninstallSkill(skillPath: string): Promise<void> {
  await codex.fsRemove({ path: skillDirectory(skillPath) });
}

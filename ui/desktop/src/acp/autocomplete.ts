import type { AgentMention, AvailableCommand } from '@aaif/goose-sdk';
import type { DisplayItem } from '../components/MentionPopover';

type SlashCommandItemType = Extract<DisplayItem['itemType'], 'Builtin' | 'Recipe' | 'Skill'>;
type AutocompleteDisplayItem = DisplayItem;

const SLASH_COMMAND_ITEM_TYPES = new Set<string>(['Builtin', 'Recipe', 'Skill']);

function isSlashCommandItemType(value: unknown): value is SlashCommandItemType {
  return typeof value === 'string' && SLASH_COMMAND_ITEM_TYPES.has(value);
}

function stringMetaValue(meta: AvailableCommand['_meta'], key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function availableCommandToDisplayItem(
  command: AvailableCommand
): AutocompleteDisplayItem | null {
  const commandType = stringMetaValue(command._meta, 'commandType');
  if (!isSlashCommandItemType(commandType)) {
    return null;
  }
  return {
    name: command.name,
    extra: command.description,
    itemType: commandType,
    relativePath: command.name,
  };
}

export function agentMentionToDisplayItem(agent: AgentMention): AutocompleteDisplayItem {
  const mention = agent.mention.trim() || `@${agent.name}`;
  return {
    name: agent.name,
    extra: agent.description,
    itemType: 'Agent',
    relativePath: agent.name,
    insertText: mention.endsWith(' ') ? mention : `${mention} `,
  };
}

export async function listSlashCommandItems(cwd: string): Promise<AutocompleteDisplayItem[]> {
  const response = (await window.codex.request('skills/list', {
    cwds: cwd.trim() ? [cwd.trim()] : [],
  })) as {
    data: Array<{ skills: Array<{ name: string; description: string; enabled: boolean }> }>;
  };
  return response.data
    .flatMap((entry) => entry.skills)
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      name: skill.name,
      extra: skill.description,
      itemType: 'Skill' as const,
      relativePath: skill.name,
    }));
}

export async function listAgentMentionItems(
  _cwd: string,
  _sessionId?: string
): Promise<AutocompleteDisplayItem[]> {
  return [];
}

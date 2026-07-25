import type { Message } from '../../types/message';
import type { SkillMetadata } from '../protocol/v2/SkillMetadata';
import type { UserInput as CodexUserInput } from '../protocol/v2/UserInput';

function messageText(message: Message): string {
  return message.content
    .map((content) => (content.type === 'text' ? content.text : ''))
    .filter(Boolean)
    .join('\n');
}

export function explicitSkillName(message: Message): string | null {
  return /^\/(\S+)(?:\s|$)/.exec(messageText(message))?.[1] ?? null;
}

export function messageToCodexInput(
  message: Message,
  selectedSkill: SkillMetadata | null = null
): CodexUserInput[] {
  let text = messageText(message);
  const input: CodexUserInput[] = [];

  if (selectedSkill) {
    input.push({ type: 'skill', name: selectedSkill.name, path: selectedSkill.path });
    text = text.replace(new RegExp(`^/${escapeRegExp(selectedSkill.name)}(?:\\s+|$)`), '');
  }

  if (text) {
    input.push({ type: 'text', text, text_elements: [] });
  }

  for (const content of message.content) {
    if (content.type === 'image') {
      input.push({
        type: 'image',
        url: `data:${content.mimeType};base64,${content.data}`,
      });
    }
  }

  return input;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

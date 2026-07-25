import type { Message } from '../../types/message';
import type { SkillMetadata } from '../protocol/v2/SkillMetadata';
import type { TextElement } from '../protocol/v2/TextElement';
import type { UserInput as CodexUserInput } from '../protocol/v2/UserInput';

function messageText(message: Message): string {
  return message.content
    .map((content) => (content.type === 'text' ? content.text : ''))
    .filter(Boolean)
    .join('\n');
}

export function explicitSkillName(message: Message): string | null {
  const reference = message.content.find((content) => content.type === 'skill');
  if (reference) return reference.name;
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

  // Codex only reads attached files when their path is part of the prompt text, so the
  // paths are appended and marked as text elements — that is what lets a resumed thread
  // render them as chips again instead of as bare paths.
  const textElements: TextElement[] = [];
  for (const attachment of message.content) {
    if (attachment.type !== 'fileAttachment') continue;
    if (text) text += ' ';
    const start = utf8Length(text);
    text += attachment.path;
    textElements.push({
      byteRange: { start, end: utf8Length(text) },
      placeholder: attachment.name,
    });
  }

  if (text) {
    input.push({ type: 'text', text, text_elements: textElements });
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

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

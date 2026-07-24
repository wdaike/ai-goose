import type { Message } from '../../types/message';
import type { UserInput as CodexUserInput } from '../protocol/v2/UserInput';

export function messageToCodexInput(message: Message): CodexUserInput[] {
  const text = message.content
    .map((content) => (content.type === 'text' ? content.text : ''))
    .filter(Boolean)
    .join('\n');
  const input: CodexUserInput[] = [];

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

import { describe, expect, it } from 'vitest';
import { createUserMessage } from '../../types/message';
import { messageToCodexInput } from './input';

describe('messageToCodexInput', () => {
  it('includes attached images in Codex turn input', () => {
    const message = createUserMessage('Summarize this image', [
      { data: 'aW1hZ2UtZGF0YQ==', mimeType: 'image/png' },
    ]);

    expect(messageToCodexInput(message)).toEqual([
      {
        type: 'text',
        text: 'Summarize this image',
        text_elements: [],
      },
      {
        type: 'image',
        url: 'data:image/png;base64,aW1hZ2UtZGF0YQ==',
      },
    ]);
  });

  it('allows image-only turns', () => {
    const message = createUserMessage('', [
      { data: 'aW1hZ2UtZGF0YQ==', mimeType: 'image/jpeg' },
    ]);

    expect(messageToCodexInput(message)).toEqual([
      {
        type: 'image',
        url: 'data:image/jpeg;base64,aW1hZ2UtZGF0YQ==',
      },
    ]);
  });
});

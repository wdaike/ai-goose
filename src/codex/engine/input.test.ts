import { describe, expect, it } from 'vitest';
import { createUserMessage } from '../../types/message';
import type { SkillMetadata } from '../protocol/v2/SkillMetadata';
import { explicitSkillName, messageToCodexInput } from './input';

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

  it('turns an explicit slash command into structured skill input', () => {
    const message = createUserMessage('/pdf:pdf 生成 PDF', []);
    const skill: SkillMetadata = {
      name: 'pdf:pdf',
      description: 'Create and inspect PDFs',
      path: '/skills/pdf/SKILL.md',
      scope: 'user',
      enabled: true,
    };

    expect(explicitSkillName(message)).toBe('pdf:pdf');
    expect(messageToCodexInput(message, skill)).toEqual([
      {
        type: 'skill',
        name: 'pdf:pdf',
        path: '/skills/pdf/SKILL.md',
      },
      {
        type: 'text',
        text: '生成 PDF',
        text_elements: [],
      },
    ]);
  });

  it('leaves unknown slash commands as text', () => {
    const message = createUserMessage('/not-a-skill keep this', []);

    expect(messageToCodexInput(message)).toEqual([
      {
        type: 'text',
        text: '/not-a-skill keep this',
        text_elements: [],
      },
    ]);
  });
});

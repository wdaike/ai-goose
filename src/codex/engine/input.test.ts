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

  it('reads the skill picked in the composer from the message content', () => {
    const message = createUserMessage('生成 PDF', [], [], 'pdf:pdf');
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

  it('appends attached file paths to the prompt text and marks their spans', () => {
    const message = createUserMessage('简要总结', [], [{ name: 'report.pdf', path: '/tmp/a b.pdf' }]);
    const prefixBytes = new TextEncoder().encode('简要总结 ').length;

    expect(messageToCodexInput(message)).toEqual([
      {
        type: 'text',
        text: '简要总结 /tmp/a b.pdf',
        text_elements: [
          {
            byteRange: { start: prefixBytes, end: prefixBytes + '/tmp/a b.pdf'.length },
            placeholder: 'report.pdf',
          },
        ],
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

import { describe, expect, it } from 'vitest';
import type { Message } from '../types/message';
import { getWorkGroupEntries, identifyWorkGroups } from './toolCallChaining';

function message(id: string, workGroupId?: string): Message {
  return {
    id,
    role: 'assistant',
    created: 0,
    content: [{ type: 'text', text: id }],
    metadata: { userVisible: true, agentVisible: true, workGroupId },
  };
}

function toolMessage(id: string, workGroupId: string): Message {
  return {
    id,
    role: 'assistant',
    created: 0,
    content: [
      {
        type: 'toolRequest',
        id,
        toolCall: { status: 'success', value: { name: 'shell', arguments: {} } },
      },
    ],
    metadata: { userVisible: true, agentVisible: true, workGroupId },
  };
}

describe('identifyWorkGroups', () => {
  it('collects all activity from a turn into one group', () => {
    const messages = [
      message('reasoning-1', 'turn-1'),
      message('commentary', 'turn-1'),
      message('tool', 'turn-1'),
      message('final'),
      message('reasoning-2', 'turn-2'),
    ];

    expect(identifyWorkGroups(messages)).toEqual([[0, 1, 2], [4]]);
  });

  it('keeps command batches between their surrounding progress messages', () => {
    const messages = [
      message('progress-1', 'turn-1'),
      toolMessage('command-1', 'turn-1'),
      toolMessage('command-2', 'turn-1'),
      message('progress-2', 'turn-1'),
    ];

    expect(getWorkGroupEntries(messages, [0, 1, 2, 3])).toEqual([
      { type: 'message', index: 0 },
      { type: 'tools', indexes: [1, 2] },
      { type: 'message', index: 3 },
    ]);
  });
});

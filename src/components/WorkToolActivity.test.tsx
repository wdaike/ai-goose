import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import type { Message } from '../types/message';
import WorkToolActivity, { getWorkToolKinds } from './WorkToolActivity';

function toolMessage(id: string, name: string, args: Record<string, unknown> = {}): Message {
  return {
    id,
    role: 'assistant',
    created: 0,
    content: [
      {
        type: 'toolRequest',
        id,
        toolCall: { status: 'success', value: { name, arguments: args } },
      },
    ],
    metadata: { userVisible: true, agentVisible: true },
  };
}

describe('getWorkToolKinds', () => {
  it('builds ChatGPT-style activity categories from command actions', () => {
    const messages = [
      toolMessage('read', 'shell', {
        command: 'sed -n 1,80p src/main.ts',
        command_actions: [
          { type: 'read', name: 'main.ts' },
          { type: 'unknown', command: 'pnpm test' },
        ],
      }),
      toolMessage('edit', 'edit_file'),
    ];

    expect([...getWorkToolKinds(messages)]).toEqual([
      ['readFiles', 1],
      ['ranCommands', 1],
      ['editedFiles', 1],
    ]);
  });

  it('falls back to a generic tool activity', () => {
    expect([...getWorkToolKinds([toolMessage('custom', 'server__custom_tool')])]).toEqual([
      ['usedTools', 1],
    ]);
  });

  it('reveals the individual commands when the activity summary is opened', async () => {
    const messages = [
      toolMessage('read', 'shell', {
        command_actions: [{ type: 'read', name: 'main.ts' }],
      }),
      toolMessage('run', 'shell'),
    ];
    render(
      <WorkToolActivity forceExpanded={false} messages={messages}>
        <div>pnpm test</div>
      </WorkToolActivity>,
      { wrapper: IntlTestWrapper }
    );

    expect(screen.queryByText('pnpm test')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Read files, Ran a command' }));
    expect(screen.getByText('pnpm test')).toBeInTheDocument();
  });
});

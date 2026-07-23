import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ToolRequestMessageContent, ToolResponseMessageContent } from '../types/message';
import ToolCallWithResponse from './ToolCallWithResponse';

function shellRequest(command: string): ToolRequestMessageContent {
  return {
    type: 'toolRequest',
    id: 'command-1',
    toolCall: {
      status: 'success',
      value: { name: 'shell', arguments: { command } },
    },
  };
}

function shellResponse(output: string): ToolResponseMessageContent {
  return {
    type: 'toolResponse',
    id: 'command-1',
    toolResult: {
      status: 'success',
      value: {
        content: [{ type: 'text', text: output }],
        isError: false,
      },
    },
  };
}

describe('ToolCallWithResponse shell command', () => {
  it('renders command and output in a dedicated Shell card', () => {
    render(
      <ToolCallWithResponse
        isCancelledMessage={false}
        isPendingApproval={false}
        toolRequest={shellRequest('pnpm test')}
        toolResponse={shellResponse('12 tests passed')}
      />
    );

    expect(screen.getByText('Shell')).toBeInTheDocument();
    expect(screen.getByText('pnpm test')).toBeInTheDocument();
    expect(screen.getByText('12 tests passed')).toBeInTheDocument();
    expect(screen.queryByText('Tool Details')).not.toBeInTheDocument();
  });
});

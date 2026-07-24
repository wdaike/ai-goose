import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import type { Message } from '../types/message';
import GooseMessage from './GooseMessage';

const message: Message = {
  id: 'assistant-message-1',
  role: 'assistant',
  created: 1_700_000_000,
  content: [{ type: 'text', text: 'Reply content' }],
  metadata: { userVisible: true, agentVisible: true },
};

describe('GooseMessage', () => {
  it('uses the full message width so its right edge aligns with user messages', () => {
    const { container } = render(
      <GooseMessage
        sessionId="session-1"
        message={message}
        messages={[message]}
        append={vi.fn()}
        toolCallNotifications={new Map()}
        isStreaming={false}
      />,
      { wrapper: IntlTestWrapper }
    );

    expect(screen.getByText('Reply content')).toBeInTheDocument();
    expect(container.querySelector('.goose-message')).toHaveClass('w-full');
    expect(container.querySelector('.goose-message')).not.toHaveClass('w-[90%]');
  });
});

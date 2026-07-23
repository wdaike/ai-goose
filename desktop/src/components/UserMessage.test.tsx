import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import type { Message } from '../types/message';
import UserMessage from './UserMessage';

const message: Message = {
  id: 'message-1',
  role: 'user',
  created: 1_700_000_000,
  content: [{ type: 'text', text: 'Original prompt' }],
  metadata: { userVisible: true, agentVisible: true },
};

function renderMessage(onMessageUpdate = vi.fn()) {
  render(<UserMessage message={message} onMessageUpdate={onMessageUpdate} />, {
    wrapper: IntlTestWrapper,
  });
  return onMessageUpdate;
}

describe('UserMessage editing', () => {
  beforeEach(() => {
    window.electron.logInfo = vi.fn();
  });

  it('shows ChatGPT-style icon actions without replacing the timestamp', async () => {
    const user = userEvent.setup();
    renderMessage();

    expect(screen.getByTestId('user-message-bubble')).toHaveClass(
      'bg-background-secondary',
      'text-text-primary'
    );
    expect(screen.getByTestId('user-message-bubble')).not.toHaveClass('bg-text-primary');
    const editButton = screen.getByRole('button', { name: 'Edit message: Original prompt' });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(editButton).toHaveClass('size-8', 'rounded-[10px]');
    expect(document.querySelector('time')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();

    await user.hover(editButton);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Edit');
    expect(document.querySelector('time')).toBeInTheDocument();
  });

  it('uses the ChatGPT-style inline editor and forks when sent', async () => {
    const user = userEvent.setup();
    const onMessageUpdate = renderMessage();

    await user.click(screen.getByRole('button', { name: 'Edit message: Original prompt' }));

    const editor = screen.getByTestId('user-message-editor');
    const textarea = screen.getByRole('textbox', { name: 'Edit message content' });
    expect(editor).toHaveClass('min-h-[120px]', 'rounded-[26px]', 'bg-background-secondary');
    expect(textarea).toHaveValue('Original prompt');
    expect(screen.queryByText('Edit in Place')).not.toBeInTheDocument();
    expect(screen.queryByText('Fork Session')).not.toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, 'Updated prompt');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(onMessageUpdate).toHaveBeenCalledWith('message-1', 'Updated prompt', 'fork');
    expect(screen.queryByTestId('user-message-editor')).not.toBeInTheDocument();
  });

  it('restores the original message when editing is cancelled', async () => {
    const user = userEvent.setup();
    renderMessage();

    await user.click(screen.getByRole('button', { name: 'Edit message: Original prompt' }));
    const textarea = screen.getByRole('textbox', { name: 'Edit message content' });
    await user.clear(textarea);
    await user.type(textarea, 'Discard this');
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));

    expect(screen.queryByTestId('user-message-editor')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit message: Original prompt' }));
    expect(screen.getByRole('textbox', { name: 'Edit message content' })).toHaveValue(
      'Original prompt'
    );
  });
});

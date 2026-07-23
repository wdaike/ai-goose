import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import ToolCallGroup from './ToolCallGroup';

describe('ToolCallGroup', () => {
  it('shows completed work by default and lets the user collapse it', async () => {
    render(
      <ToolCallGroup activeLabel="Working" completedLabel="Worked for 1s" isActive={false}>
        <div>Ran pnpm test</div>
      </ToolCallGroup>
    );

    expect(screen.getByText('Ran pnpm test')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Worked for 1s' }));
    expect(screen.queryByText('Ran pnpm test')).not.toBeInTheDocument();
  });
});

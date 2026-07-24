import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import PlanSteps from './PlanSteps';

describe('PlanSteps', () => {
  it('keeps only progress visible until the chip is hovered', async () => {
    render(
      <PlanSteps
        plan={{
          explanation: null,
          steps: [
            { step: 'Inspect entry points', status: 'completed' },
            { step: 'Trace dependencies', status: 'inProgress' },
            { step: 'Summarize the architecture', status: 'pending' },
          ],
        }}
      />,
      { wrapper: IntlTestWrapper }
    );

    const progress = screen.getByRole('button', { name: 'Step 2 / 3' });
    expect(screen.queryByText('Inspect entry points')).not.toBeInTheDocument();

    await userEvent.hover(progress);

    expect(screen.getByText('Inspect entry points')).toBeInTheDocument();
    expect(screen.getByText('Trace dependencies')).toBeInTheDocument();
    expect(screen.getByText('Summarize the architecture')).toBeInTheDocument();
  });

  it('shows the final step when the plan is complete', () => {
    render(
      <PlanSteps
        plan={{
          explanation: null,
          steps: [
            { step: 'First', status: 'completed' },
            { step: 'Second', status: 'completed' },
          ],
        }}
      />,
      { wrapper: IntlTestWrapper }
    );

    expect(screen.getByText('Step 2 / 2')).toBeInTheDocument();
  });

  it('shows the plan details when the progress chip receives keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <PlanSteps
        plan={{
          explanation: 'Plan details',
          steps: [{ step: 'Inspect entry points', status: 'inProgress' }],
        }}
      />,
      { wrapper: IntlTestWrapper }
    );

    await user.tab();

    expect(screen.getByText('Plan details')).toBeInTheDocument();
    expect(screen.getByText('Inspect entry points')).toBeInTheDocument();
  });
});

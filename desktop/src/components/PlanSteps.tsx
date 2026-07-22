import { Check, Circle, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { defineMessages, useIntl } from '../i18n';
import type { PlanContent, PlanStep } from '../types/message';
import { cn } from '../utils';

const i18n = defineMessages({
  progress: {
    id: 'planSteps.progress',
    defaultMessage: 'Step {current} / {total}',
  },
});

function StepIcon({ status }: Pick<PlanStep, 'status'>) {
  switch (status) {
    case 'completed':
      return <Check className="h-4 w-4 text-text-secondary" />;
    case 'inProgress':
      return <LoaderCircle className="h-4 w-4 animate-spin text-blue-500" />;
    case 'pending':
      return <Circle className="h-4 w-4 text-text-secondary" />;
  }
}

interface PlanStepsProps {
  plan: PlanContent;
}

export default function PlanSteps({ plan }: PlanStepsProps) {
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const activeIndex = plan.steps.findIndex((step) => step.status === 'inProgress');
  const pendingIndex = plan.steps.findIndex((step) => step.status === 'pending');
  const currentIndex = activeIndex >= 0 ? activeIndex : pendingIndex >= 0 ? pendingIndex : -1;
  const current = currentIndex >= 0 ? currentIndex + 1 : plan.steps.length;

  if (plan.steps.length === 0) return null;

  return (
    <div
      className="relative flex justify-center"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      {isOpen && (
        <div className="absolute bottom-full mb-2 w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border-primary bg-background-secondary px-4 py-3 shadow-lg">
          {plan.explanation && (
            <div className="mb-3 text-sm text-text-primary">{plan.explanation}</div>
          )}
          <div className="flex flex-col gap-2">
            {plan.steps.map((step, index) => (
              <div
                key={`${index}-${step.step}`}
                className={cn(
                  'flex items-start gap-2 text-sm',
                  step.status === 'inProgress' ? 'text-text-primary' : 'text-text-secondary'
                )}
              >
                <span className="mt-0.5 shrink-0">
                  <StepIcon status={step.status} />
                </span>
                <span className={cn(step.status === 'completed' && 'opacity-70')}>{step.step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        aria-expanded={isOpen}
        className="flex cursor-default items-center gap-2 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-secondary shadow-sm"
      >
        <span
          className={cn(
            'h-3.5 w-3.5 rounded-full border-2',
            activeIndex >= 0 ? 'border-blue-500' : 'border-text-secondary'
          )}
        />
        {intl.formatMessage(i18n.progress, { current, total: plan.steps.length })}
      </button>
    </div>
  );
}

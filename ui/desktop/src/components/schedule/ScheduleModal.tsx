import React, { useState, useEffect, FormEvent } from 'react';
import type { RecipeDto, ScheduledJobDto } from '@aaif/goose-sdk';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { CronPicker } from './CronPicker';
import ClockIcon from '../../assets/clock-icon.svg';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  editSchedule: { id: 'scheduleModal.editSchedule', defaultMessage: 'Edit Schedule' },
  createNewSchedule: {
    id: 'scheduleModal.createNewSchedule',
    defaultMessage: 'Create New Schedule',
  },
  nameLabel: { id: 'scheduleModal.nameLabel', defaultMessage: 'Name:' },
  namePlaceholder: {
    id: 'scheduleModal.namePlaceholder',
    defaultMessage: 'e.g., daily-summary-job',
  },
  promptLabel: { id: 'scheduleModal.promptLabel', defaultMessage: 'Prompt:' },
  promptPlaceholder: {
    id: 'scheduleModal.promptPlaceholder',
    defaultMessage: 'What should goose do on each run?',
  },
  scheduleLabel: { id: 'scheduleModal.scheduleLabel', defaultMessage: 'Schedule:' },
  cancel: { id: 'scheduleModal.cancel', defaultMessage: 'Cancel' },
  updating: { id: 'scheduleModal.updating', defaultMessage: 'Updating...' },
  creating: { id: 'scheduleModal.creating', defaultMessage: 'Creating...' },
  updateSchedule: { id: 'scheduleModal.updateSchedule', defaultMessage: 'Update Schedule' },
  createSchedule: { id: 'scheduleModal.createSchedule', defaultMessage: 'Create Schedule' },
  scheduleIdRequired: {
    id: 'scheduleModal.scheduleIdRequired',
    defaultMessage: 'Schedule ID is required.',
  },
  promptRequired: {
    id: 'scheduleModal.promptRequired',
    defaultMessage: 'A prompt is required.',
  },
});

export interface NewSchedulePayload {
  id: string;
  recipe: RecipeDto;
  cron: string;
}

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: NewSchedulePayload | string) => Promise<void>;
  schedule: ScheduledJobDto | null;
  isLoadingExternally: boolean;
  apiErrorExternally: string | null;
}

const modalLabelClassName = 'block text-sm font-medium text-text-primary mb-1';

/**
 * The backend still models a scheduled job as a recipe, so a scheduled prompt
 * is sent as a minimal recipe carrying just that prompt.
 */
function promptToRecipe(id: string, prompt: string): RecipeDto {
  return { title: id, description: prompt.split('\n')[0].slice(0, 120), prompt };
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  schedule,
  isLoadingExternally,
  apiErrorExternally,
}) => {
  const intl = useIntl();
  const isEditMode = !!schedule;

  const [scheduleId, setScheduleId] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [cronExpression, setCronExpression] = useState<string>('0 0 14 * * *');
  const [internalValidationError, setInternalValidationError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    if (schedule) {
      setScheduleId(schedule.id);
      setCronExpression(schedule.cron);
    } else {
      setScheduleId('');
      setPrompt('');
      setCronExpression('0 0 14 * * *');
      setInternalValidationError(null);
    }
  }, [isOpen, schedule]);

  const handleLocalSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setInternalValidationError(null);

    if (isEditMode) {
      await onSubmit(cronExpression);
      return;
    }

    const trimmedId = scheduleId.trim();
    if (!trimmedId) {
      setInternalValidationError(intl.formatMessage(i18n.scheduleIdRequired));
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setInternalValidationError(intl.formatMessage(i18n.promptRequired));
      return;
    }

    await onSubmit({
      id: trimmedId,
      recipe: promptToRecipe(trimmedId, trimmedPrompt),
      cron: cronExpression,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-background-primary shadow-xl rounded-3xl z-50 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-8 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={ClockIcon} alt="Clock" className="w-8 h-8" />
            <div className="flex-1">
              <h2 className="text-base font-semibold text-text-primary">
                {isEditMode
                  ? intl.formatMessage(i18n.editSchedule)
                  : intl.formatMessage(i18n.createNewSchedule)}
              </h2>
              {isEditMode && <p className="text-sm text-text-secondary">{schedule.id}</p>}
            </div>
          </div>
        </div>

        <form
          id="schedule-form"
          onSubmit={handleLocalSubmit}
          className="px-8 py-4 space-y-4 flex-grow overflow-y-auto"
        >
          {apiErrorExternally && (
            <p className="text-text-danger text-sm mb-3 p-2 border border-border-danger rounded-md">
              {apiErrorExternally}
            </p>
          )}
          {internalValidationError && (
            <p className="text-text-danger text-sm mb-3 p-2 border border-border-danger rounded-md">
              {internalValidationError}
            </p>
          )}

          {!isEditMode && (
            <>
              <div>
                <label htmlFor="scheduleId-modal" className={modalLabelClassName}>
                  {intl.formatMessage(i18n.nameLabel)} <span className="text-text-danger">*</span>
                </label>
                <Input
                  type="text"
                  id="scheduleId-modal"
                  value={scheduleId}
                  onChange={(e) => setScheduleId(e.target.value)}
                  placeholder={intl.formatMessage(i18n.namePlaceholder)}
                  required
                />
              </div>

              <div>
                <label htmlFor="schedulePrompt-modal" className={modalLabelClassName}>
                  {intl.formatMessage(i18n.promptLabel)} <span className="text-text-danger">*</span>
                </label>
                <textarea
                  id="schedulePrompt-modal"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={intl.formatMessage(i18n.promptPlaceholder)}
                  rows={5}
                  required
                  className="w-full resize-y rounded-lg border border-border-primary bg-background-primary p-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-border-active"
                />
              </div>
            </>
          )}

          <div>
            <label className={modalLabelClassName}>{intl.formatMessage(i18n.scheduleLabel)}</label>
            <CronPicker schedule={schedule} onChange={setCronExpression} isValid={setIsValid} />
          </div>
        </form>

        <div className="flex gap-2 px-8 py-4 border-t border-border-primary">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isLoadingExternally}
            className="flex-1 text-text-secondary"
          >
            {intl.formatMessage(i18n.cancel)}
          </Button>
          <Button
            type="submit"
            form="schedule-form"
            disabled={isLoadingExternally || !isValid}
            className="flex-1"
          >
            {isLoadingExternally
              ? isEditMode
                ? intl.formatMessage(i18n.updating)
                : intl.formatMessage(i18n.creating)
              : isEditMode
                ? intl.formatMessage(i18n.updateSchedule)
                : intl.formatMessage(i18n.createSchedule)}
          </Button>
        </div>
      </Card>
    </div>
  );
};

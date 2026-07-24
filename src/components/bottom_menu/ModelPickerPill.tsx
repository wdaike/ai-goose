import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, LoaderCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useModelAndProvider } from '../ModelAndProviderContext';
import {
  acpReadThinkingEffort,
  acpSaveThinkingEffort,
  acpSetSessionProviderModel,
} from '../../acp/providers';
import type { ThinkingEffort } from '../../types/providers';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  model: {
    id: 'modelPickerPill.model',
    defaultMessage: 'Model',
  },
  effort: {
    id: 'modelPickerPill.effort',
    defaultMessage: 'Effort',
  },
  speed: {
    id: 'modelPickerPill.speed',
    defaultMessage: 'Speed',
  },
  standard: {
    id: 'modelPickerPill.standard',
    defaultMessage: 'Standard',
  },
  advanced: {
    id: 'modelPickerPill.advanced',
    defaultMessage: 'Advanced',
  },
  selectModel: {
    id: 'modelPickerPill.selectModel',
    defaultMessage: 'Select model',
  },
  loadingModel: {
    id: 'modelPickerPill.loadingModel',
    defaultMessage: 'Loading…',
  },
  effortLow: {
    id: 'modelPickerPill.effortLow',
    defaultMessage: 'Low',
  },
  effortMedium: {
    id: 'modelPickerPill.effortMedium',
    defaultMessage: 'Medium',
  },
  effortHigh: {
    id: 'modelPickerPill.effortHigh',
    defaultMessage: 'High',
  },
  effortMax: {
    id: 'modelPickerPill.effortMax',
    defaultMessage: 'Max',
  },
});

/** Provider id for Alibaba Qwen (DashScope compatible-mode), see codex/bridge.ts. */
const QWEN_PROVIDER_ID = 'alibaba';

interface QwenModel {
  id: string;
  label: string;
}

/** The picker only offers these Qwen models. */
const QWEN_MODELS: QwenModel[] = [
  { id: 'qwen3.7-plus', label: 'Qwen3.7-Plus' },
  { id: 'qwen3.8-max-preview', label: 'Qwen3.8-Max-Preview' },
  { id: 'qwen3.7-max', label: 'Qwen3.7-Max' },
];

const EFFORT_OPTIONS: { value: ThinkingEffort; label: keyof typeof i18n }[] = [
  { value: 'low', label: 'effortLow' },
  { value: 'medium', label: 'effortMedium' },
  { value: 'high', label: 'effortHigh' },
  { value: 'max', label: 'effortMax' },
];

interface ModelPickerPillProps {
  sessionId: string | null;
  /** Effective model for the session (override ?? session ?? config default). */
  model: string | null;
  sessionLoaded?: boolean;
  onModelChanged: (override: { model: string; provider: string }) => void;
}

/**
 * ChatGPT-Codex-style model selector pill for the chat input's bottom bar.
 *
 * Trigger reads "<model> <effort>" (e.g. "Qwen3 Max High"); the popover has
 * Model / Effort rows with submenus plus an Advanced section revealing Speed,
 * mirroring the Codex composer. Model choice is limited to the Qwen family.
 */
export default function ModelPickerPill({
  sessionId,
  model,
  sessionLoaded,
  onModelChanged,
}: ModelPickerPillProps) {
  const intl = useIntl();
  const { changeModel, currentModel: configModel } = useModelAndProvider();
  const [effort, setEffort] = useState<ThinkingEffort>('high');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const effectiveModel = model ?? configModel;
  const currentEntry = QWEN_MODELS.find((entry) => entry.id === effectiveModel);
  const modelLabel =
    currentEntry?.label ?? effectiveModel ?? intl.formatMessage(i18n.selectModel);
  const effortLabel = intl.formatMessage(
    i18n[EFFORT_OPTIONS.find((option) => option.value === effort)?.label ?? 'effortHigh']
  );
  const isModelLoading = Boolean(sessionId && !sessionLoaded);

  useEffect(() => {
    acpReadThinkingEffort()
      .then((saved) => {
        if (saved && saved !== 'off') setEffort(saved);
      })
      .catch(() => {});
  }, []);

  const handleSelectModel = async (entry: QwenModel) => {
    if (entry.id === effectiveModel) return;
    const changed = await changeModel(sessionId, {
      name: entry.id,
      provider: QWEN_PROVIDER_ID,
      alias: entry.label,
      request_params: { thinking_effort: effort },
    });
    if (changed) onModelChanged({ model: entry.id, provider: QWEN_PROVIDER_ID });
  };

  const handleSelectEffort = async (value: ThinkingEffort) => {
    setEffort(value);
    try {
      await acpSaveThinkingEffort(value);
      if (sessionId && effectiveModel) {
        await acpSetSessionProviderModel(sessionId, QWEN_PROVIDER_ID, effectiveModel, value);
      }
    } catch (error) {
      console.error('Failed to save thinking effort:', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isModelLoading}
        className="flex min-w-0 items-center gap-1.5 rounded-full bg-background-tertiary px-4 py-1.5 text-sm transition-colors hover:cursor-pointer hover:bg-background-tertiary/70"
      >
        {isModelLoading ? (
          <span
            data-testid="model-loading-state"
            className="flex items-center gap-1.5 text-text-secondary"
          >
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            {intl.formatMessage(i18n.loadingModel)}
          </span>
        ) : (
          <>
            <span className="truncate text-text-primary">{modelLabel}</span>
            <span className="text-text-secondary">{effortLabel}</span>
          </>
        )}
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-text-secondary" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="end" className="w-72 rounded-2xl p-1.5">
        {/* Model row */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="py-2">
            <span>{intl.formatMessage(i18n.model)}</span>
            <span className="ml-auto pl-6 text-text-secondary truncate">{modelLabel}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56 rounded-2xl p-2">
            <div className="px-2 pt-1 pb-2 text-sm text-text-secondary">
              {intl.formatMessage(i18n.model)}
            </div>
            {QWEN_MODELS.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                className="rounded-lg px-2 py-2"
                onClick={() => void handleSelectModel(entry)}
              >
                <span>{entry.label}</span>
                {entry.id === effectiveModel && <Check className="ml-auto h-4 w-4 flex-shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Effort row */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="py-2">
            <span>{intl.formatMessage(i18n.effort)}</span>
            <span className="ml-auto pl-6 text-text-secondary">{effortLabel}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40 rounded-xl p-1.5">
            {EFFORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                className="py-2"
                onClick={() => void handleSelectEffort(option.value)}
              >
                <span>{intl.formatMessage(i18n[option.label])}</span>
                {option.value === effort && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Speed row (Qwen has a single tier; shown under Advanced like Codex) */}
        {advancedOpen && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="py-2">
              <span>{intl.formatMessage(i18n.speed)}</span>
              <span className="ml-auto pl-6 text-text-secondary">
                {intl.formatMessage(i18n.standard)}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40 rounded-xl p-1.5">
              <DropdownMenuItem className="py-2">
                <span>{intl.formatMessage(i18n.standard)}</span>
                <Check className="ml-auto h-4 w-4" />
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />

        {/* Advanced toggle */}
        <DropdownMenuItem
          className="py-2"
          onSelect={(event) => {
            event.preventDefault();
            setAdvancedOpen((open) => !open);
          }}
        >
          <span>{intl.formatMessage(i18n.advanced)}</span>
          {advancedOpen ? (
            <ChevronUp className="ml-1 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-1 h-4 w-4" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

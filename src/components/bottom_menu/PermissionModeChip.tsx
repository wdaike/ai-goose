import { MessageCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useConfig } from '../ConfigContext';
import { cn } from '../../utils';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  fullAccess: {
    id: 'permissionModeChip.fullAccess',
    defaultMessage: 'Full access',
  },
  approve: {
    id: 'permissionModeChip.approve',
    defaultMessage: 'Manual approval',
  },
  smartApprove: {
    id: 'permissionModeChip.smartApprove',
    defaultMessage: 'Smart approval',
  },
  chatOnly: {
    id: 'permissionModeChip.chatOnly',
    defaultMessage: 'Chat only',
  },
});

const MODE_DISPLAY: Record<string, { label: keyof typeof i18n; icon: LucideIcon; warn: boolean }> = {
  auto: { label: 'fullAccess', icon: ShieldAlert, warn: true },
  approve: { label: 'approve', icon: ShieldCheck, warn: false },
  smart_approve: { label: 'smartApprove', icon: ShieldCheck, warn: false },
  chat: { label: 'chatOnly', icon: MessageCircle, warn: false },
};

/**
 * Compact chip in the chat input's bottom bar showing the current permission
 * mode (ChatGPT-style "Full access" pill). Clicking opens the mode settings.
 */
export const PermissionModeChip = ({ onClick }: { onClick: () => void }) => {
  const intl = useIntl();
  const { config } = useConfig();

  const mode = (config.GOOSE_MODE as string | undefined) ?? 'auto';
  const display = MODE_DISPLAY[mode] ?? MODE_DISPLAY.auto;
  const Icon = display.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors hover:cursor-pointer',
        display.warn
          ? 'text-text-warning hover:bg-background-warning/20'
          : 'text-text-primary/70 hover:bg-background-tertiary hover:text-text-primary'
      )}
    >
      <Icon size={14} />
      {intl.formatMessage(i18n[display.label])}
    </button>
  );
};

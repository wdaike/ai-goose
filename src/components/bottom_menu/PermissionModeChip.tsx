import { Check, ChevronDown, MessageCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
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
  permissionSettings: {
    id: 'permissionModeChip.permissionSettings',
    defaultMessage: 'Permission settings',
  },
});

interface ModeDisplay {
  key: string;
  label: keyof typeof i18n;
  icon: LucideIcon;
  warn: boolean;
}

const MODES: ModeDisplay[] = [
  { key: 'auto', label: 'fullAccess', icon: ShieldAlert, warn: true },
  { key: 'smart_approve', label: 'smartApprove', icon: ShieldCheck, warn: false },
  { key: 'approve', label: 'approve', icon: ShieldCheck, warn: false },
  { key: 'chat', label: 'chatOnly', icon: MessageCircle, warn: false },
];

/**
 * Compact chip in the chat input's bottom bar showing the current permission
 * mode (ChatGPT-style "Full access" pill). The popover switches GOOSE_MODE
 * directly; the last row opens the full permission settings.
 */
export const PermissionModeChip = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
  const intl = useIntl();
  const { config, upsert } = useConfig();

  const mode = (config.GOOSE_MODE as string | undefined) ?? 'auto';
  const current = MODES.find((entry) => entry.key === mode) ?? MODES[0];
  const Icon = current.icon;

  const handleSelect = async (key: string) => {
    if (key === current.key) return;
    try {
      await upsert('GOOSE_MODE', key, false);
    } catch (error) {
      console.error('Failed to update permission mode:', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors hover:cursor-pointer',
          current.warn
            ? 'text-text-warning hover:bg-background-warning/20'
            : 'text-text-primary/70 hover:bg-background-tertiary hover:text-text-primary'
        )}
      >
        <Icon size={14} />
        {intl.formatMessage(i18n[current.label])}
        <ChevronDown size={12} className="flex-shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-56 rounded-2xl p-1.5">
        {MODES.map((entry) => {
          const EntryIcon = entry.icon;
          return (
            <DropdownMenuItem
              key={entry.key}
              className="rounded-lg px-2 py-2"
              onClick={() => void handleSelect(entry.key)}
            >
              <EntryIcon size={14} className={entry.warn ? 'text-text-warning' : undefined} />
              <span>{intl.formatMessage(i18n[entry.label])}</span>
              {entry.key === current.key && <Check className="ml-auto h-4 w-4 flex-shrink-0" />}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem className="rounded-lg px-2 py-2" onClick={onOpenSettings}>
          <span>{intl.formatMessage(i18n.permissionSettings)}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

import { Check, ChevronDown } from 'lucide-react';
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
import { PERMISSION_MODES, permissionMode } from '../settings/mode/modes';

const i18n = defineMessages({
  permissionSettings: {
    id: 'permissionModeChip.permissionSettings',
    defaultMessage: 'Permission settings',
  },
});

/**
 * Compact chip in the chat input's bottom bar showing the current permission
 * mode (ChatGPT-style "Full access" pill). The popover switches GOOSE_MODE
 * directly; the last row opens the full permission settings.
 */
export const PermissionModeChip = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
  const intl = useIntl();
  const { config, upsert } = useConfig();

  const current = permissionMode(config.GOOSE_MODE as string | undefined);
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
        {intl.formatMessage(current.label)}
        <ChevronDown size={12} className="flex-shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-56 rounded-2xl p-1.5">
        {PERMISSION_MODES.map((entry) => {
          const EntryIcon = entry.icon;
          return (
            <DropdownMenuItem
              key={entry.key}
              className="rounded-lg px-2 py-2"
              onClick={() => void handleSelect(entry.key)}
            >
              <EntryIcon size={14} className={entry.warn ? 'text-text-warning' : undefined} />
              <span>{intl.formatMessage(entry.label)}</span>
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

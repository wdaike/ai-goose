import { Switch } from '../../ui/switch';
import { SettingsRow } from '../SettingsGroup';
import { useConfig } from '../../ConfigContext';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  defaultPermissions: {
    id: 'settings.permissions.default.title',
    defaultMessage: 'Default permissions',
  },
  defaultPermissionsDesc: {
    id: 'settings.permissions.default.description',
    defaultMessage:
      'By default, iCodex can read and edit files in its workspace. It asks for approval before anything else',
  },
  autoReview: {
    id: 'settings.permissions.autoReview.title',
    defaultMessage: 'Auto-review',
  },
  autoReviewDesc: {
    id: 'settings.permissions.autoReview.description',
    defaultMessage:
      'iCodex decides which requests for additional access are safe and only asks about risky ones. Auto-review can make mistakes',
  },
  fullAccess: {
    id: 'settings.permissions.fullAccess.title',
    defaultMessage: 'Full access',
  },
  fullAccessDesc: {
    id: 'settings.permissions.fullAccess.description',
    defaultMessage:
      'iCodex can edit any file on your computer and run commands with network access, without your approval. This significantly increases the risk of data loss, leaks, or unexpected behavior',
  },
});

/**
 * The four `GOOSE_MODE` policies presented as ChatGPT's three cascading
 * permission switches — each one turned on widens what runs without approval.
 */
const MODE_BY_LEVEL = ['chat', 'approve', 'smart_approve', 'auto'] as const;

function levelOf(mode: string | undefined): number {
  const level = MODE_BY_LEVEL.indexOf((mode ?? 'auto') as (typeof MODE_BY_LEVEL)[number]);
  return level === -1 ? MODE_BY_LEVEL.length - 1 : level;
}

export const PermissionsSection = () => {
  const intl = useIntl();
  const { config, upsert } = useConfig();
  const level = levelOf(config.GOOSE_MODE as string | undefined);

  const setLevel = async (next: number) => {
    try {
      await upsert('GOOSE_MODE', MODE_BY_LEVEL[next], false);
    } catch (error) {
      console.error('Failed to update permission mode:', error);
    }
  };

  // Turning a switch on enables everything above it; turning it off disables everything below.
  const toggleLevel = (target: number) => (checked: boolean) =>
    void setLevel(checked ? target : target - 1);

  return (
    <>
      <SettingsRow
        title={intl.formatMessage(i18n.defaultPermissions)}
        description={intl.formatMessage(i18n.defaultPermissionsDesc)}
      >
        <Switch checked={level >= 1} onCheckedChange={toggleLevel(1)} variant="mono" />
      </SettingsRow>

      <SettingsRow
        title={intl.formatMessage(i18n.autoReview)}
        description={intl.formatMessage(i18n.autoReviewDesc)}
      >
        <Switch checked={level >= 2} onCheckedChange={toggleLevel(2)} variant="mono" />
      </SettingsRow>

      <SettingsRow
        title={intl.formatMessage(i18n.fullAccess)}
        description={intl.formatMessage(i18n.fullAccessDesc)}
      >
        <Switch checked={level >= 3} onCheckedChange={toggleLevel(3)} variant="mono" />
      </SettingsRow>
    </>
  );
};

import { ModeSection } from '../mode/ModeSection';
import { DictationSettings } from '../dictation/DictationSettings';
import { SecurityToggle } from '../security/SecurityToggle';
import { ResponseStylesSection } from '../response_styles/ResponseStylesSection';
import { GoosehintsSection } from './GoosehintsSection';
import { SpellcheckToggle } from './SpellcheckToggle';
import { SettingsGroup, SettingsSection } from '../SettingsGroup';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  modeTitle: {
    id: 'chatSettings.modeTitle',
    defaultMessage: 'Default Mode',
  },
  modeDescription: {
    id: 'chatSettings.modeDescription',
    defaultMessage:
      'Choose the default mode Goose uses for new sessions. Existing sessions keep their current mode.',
  },
  responseStylesTitle: {
    id: 'chatSettings.responseStylesTitle',
    defaultMessage: 'Response Styles',
  },
  responseStylesDescription: {
    id: 'chatSettings.responseStylesDescription',
    defaultMessage: 'Choose how Goose should format and style its responses',
  },
});

export default function ChatSettingsSection() {
  const intl = useIntl();

  return (
    <div className="pb-8">
      <SettingsSection title={intl.formatMessage(i18n.modeTitle)}>
        <p className="text-sm text-text-secondary mb-3">
          {intl.formatMessage(i18n.modeDescription)}
        </p>
        <SettingsGroup className="divide-y-0 px-3 py-2">
          <ModeSection />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsGroup className="divide-y-0 px-3 py-2">
          <GoosehintsSection />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsGroup className="divide-y-0 px-3 py-2">
          <DictationSettings />
          <SpellcheckToggle />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={intl.formatMessage(i18n.responseStylesTitle)}>
        <p className="text-sm text-text-secondary mb-3">
          {intl.formatMessage(i18n.responseStylesDescription)}
        </p>
        <SettingsGroup className="divide-y-0 px-3 py-2">
          <ResponseStylesSection />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsGroup className="divide-y-0 px-3 py-2">
          <SecurityToggle />
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}

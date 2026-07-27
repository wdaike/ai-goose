import { useState, useEffect } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { SettingsGroup, SettingsRow, SettingsSection } from '../SettingsGroup';
import { PermissionsSection } from '../mode/PermissionsSection';
import BlockLogoBlack from './icons/block-lockup_black.png';
import BlockLogoWhite from './icons/block-lockup_white.png';
import TelemetrySettings from './TelemetrySettings';
import { AppEvents } from '../../../constants/events';
import { trackSettingToggled } from '../../../utils/analytics';
import type {
  LanguageSetting,
  SendShortcutSetting,
  SettingKey,
  Settings,
  TurnNotificationSetting,
} from '../../../utils/settings';

const i18n = defineMessages({
  permissionsTitle: { id: 'settings.permissions.title', defaultMessage: 'Permissions' },
  generalTitle: { id: 'settings.general.title', defaultMessage: 'General' },
  composerTitle: { id: 'settings.composer.title', defaultMessage: 'Composer' },
  chatTitle: { id: 'settings.chat.title', defaultMessage: 'Chat' },
  notifications: { id: 'settings.notifications.title', defaultMessage: 'Notifications' },
  systemNotifications: {
    id: 'settings.notifications.system.title',
    defaultMessage: 'System notifications',
  },
  systemNotificationsDesc: {
    id: 'settings.notifications.system.description',
    defaultMessage: 'Notification delivery is managed by your operating system',
  },
  openSettings: { id: 'settings.notifications.openSettings', defaultMessage: 'Open Settings' },
  turnNotifications: {
    id: 'settings.notifications.turn.title',
    defaultMessage: 'Turn completion notifications',
  },
  turnNotificationsDesc: {
    id: 'settings.notifications.turn.description',
    defaultMessage: 'Set when iCodex alerts you that it has finished',
  },
  turnNotificationsAlways: { id: 'settings.notifications.turn.always', defaultMessage: 'Always' },
  turnNotificationsUnfocused: {
    id: 'settings.notifications.turn.unfocused',
    defaultMessage: 'Only when unfocused',
  },
  turnNotificationsNever: { id: 'settings.notifications.turn.never', defaultMessage: 'Never' },
  menuBarIcon: { id: 'settings.menuBarIcon.title', defaultMessage: 'Show in menu bar' },
  menuBarIconDesc: {
    id: 'settings.menuBarIcon.description',
    defaultMessage: 'Keep iCodex in the menu bar when the main window is closed',
  },
  dockIcon: { id: 'settings.dockIcon.title', defaultMessage: 'Dock icon' },
  dockIconDesc: { id: 'settings.dockIcon.description', defaultMessage: 'Show iCodex in the dock' },
  bottomPanel: { id: 'settings.bottomPanel.title', defaultMessage: 'Bottom panel' },
  bottomPanelDesc: {
    id: 'settings.bottomPanel.description',
    defaultMessage: 'Show the bottom panel control in the app header',
  },
  preventSleep: {
    id: 'settings.preventSleep.title',
    defaultMessage: 'Prevent sleep while running',
  },
  preventSleepDesc: {
    id: 'settings.preventSleep.description',
    defaultMessage:
      'Keep your computer awake while iCodex is running a task (screen can still lock)',
  },
  sendShortcut: { id: 'settings.sendShortcut.title', defaultMessage: 'Send shortcut' },
  sendShortcutDesc: {
    id: 'settings.sendShortcut.description',
    defaultMessage: 'Choose when Enter sends a prompt or inserts a new line',
  },
  sendShortcutEnter: { id: 'settings.sendShortcut.enter', defaultMessage: 'Enter' },
  sendShortcutModEnter: {
    id: 'settings.sendShortcut.modEnter',
    defaultMessage: '{mod} + Enter',
  },
  spellcheck: { id: 'spellcheckToggle.title', defaultMessage: 'Enable Spellcheck' },
  spellcheckDesc: {
    id: 'spellcheckToggle.description',
    defaultMessage: 'Check spelling in the chat input. Requires restart to take effect.',
  },
  toolDetails: { id: 'settings.toolDetails.title', defaultMessage: 'Tool call details' },
  toolDetailsDesc: {
    id: 'settings.toolDetails.description',
    defaultMessage: 'Whether tool calls start expanded or collapsed in chat',
  },
  toolDetailsExpanded: { id: 'responseStyle.detailedLabel', defaultMessage: 'Detailed' },
  toolDetailsCollapsed: { id: 'responseStyle.conciseLabel', defaultMessage: 'Concise' },
  usageStats: { id: 'settings.usageStats.title', defaultMessage: 'Show usage stats' },
  usageStatsDesc: {
    id: 'settings.usageStats.description',
    defaultMessage: 'Show tokens, speed, and cost under each response',
  },
  languageTitle: { id: 'settings.language.title', defaultMessage: 'Language' },
  languageDesc: {
    id: 'settings.language.description',
    defaultMessage: 'Choose the display language for iCodex',
  },
  languageSystem: { id: 'settings.language.systemDefault', defaultMessage: 'System Default' },
  languageEnglish: { id: 'settings.language.english', defaultMessage: 'English' },
  languageChineseSimplified: {
    id: 'settings.language.zhCN',
    defaultMessage: 'Chinese (Simplified)',
  },
  languageRussian: { id: 'settings.language.russian', defaultMessage: 'Russian' },
  languageTurkish: { id: 'settings.language.turkish', defaultMessage: 'Turkish' },
  languageHindi: { id: 'settings.language.hindi', defaultMessage: 'Hindi' },
  languageJapanese: { id: 'settings.language.japanese', defaultMessage: 'Japanese' },
  languageSpanish: { id: 'settings.language.spanish', defaultMessage: 'Spanish' },
  languageKorean: { id: 'settings.language.korean', defaultMessage: 'Korean' },
  languageFrench: { id: 'settings.language.french', defaultMessage: 'French' },
  languageGerman: { id: 'settings.language.german', defaultMessage: 'German' },
  languageItalian: { id: 'settings.language.italian', defaultMessage: 'Italian' },
  languagePortuguese: { id: 'settings.language.portuguese', defaultMessage: 'Portuguese' },
  languageIndonesian: { id: 'settings.language.indonesian', defaultMessage: 'Indonesian' },
  languageMalay: { id: 'settings.language.malay', defaultMessage: 'Malay' },
  languageVietnamese: { id: 'settings.language.vietnamese', defaultMessage: 'Vietnamese' },
  languageChineseTraditional: {
    id: 'settings.language.zhTW',
    defaultMessage: 'Chinese (Traditional)',
  },
  aboutTitle: { id: 'settings.about.title', defaultMessage: 'About' },
  helpTitle: { id: 'settings.help.title', defaultMessage: 'Help & feedback' },
  helpDesc: {
    id: 'settings.help.description',
    defaultMessage: 'Help us improve iCodex by reporting issues or requesting new features',
  },
  reportBug: { id: 'settings.help.reportBug', defaultMessage: 'Report a Bug' },
  requestFeature: { id: 'settings.help.requestFeature', defaultMessage: 'Request a Feature' },
  versionTitle: { id: 'settings.version.title', defaultMessage: 'Version' },
});

const LANGUAGE_OPTIONS: Array<{ value: LanguageSetting; message: keyof typeof i18n }> = [
  { value: 'system', message: 'languageSystem' },
  { value: 'en', message: 'languageEnglish' },
  { value: 'es', message: 'languageSpanish' },
  { value: 'fr', message: 'languageFrench' },
  { value: 'de', message: 'languageGerman' },
  { value: 'it', message: 'languageItalian' },
  { value: 'pt', message: 'languagePortuguese' },
  { value: 'id', message: 'languageIndonesian' },
  { value: 'ms', message: 'languageMalay' },
  { value: 'vi', message: 'languageVietnamese' },
  { value: 'hi', message: 'languageHindi' },
  { value: 'ja', message: 'languageJapanese' },
  { value: 'ko', message: 'languageKorean' },
  { value: 'ru', message: 'languageRussian' },
  { value: 'tr', message: 'languageTurkish' },
  { value: 'zh-CN', message: 'languageChineseSimplified' },
  { value: 'zh-TW', message: 'languageChineseTraditional' },
];

const TOOL_DETAIL_OPTIONS: Array<{ value: string; message: keyof typeof i18n }> = [
  { value: 'concise', message: 'toolDetailsCollapsed' },
  { value: 'detailed', message: 'toolDetailsExpanded' },
];

const SEND_SHORTCUT_OPTIONS: Array<{ value: SendShortcutSetting; message: keyof typeof i18n }> = [
  { value: 'enter', message: 'sendShortcutEnter' },
  { value: 'mod+enter', message: 'sendShortcutModEnter' },
];

const TURN_NOTIFICATION_OPTIONS: Array<{
  value: TurnNotificationSetting;
  message: keyof typeof i18n;
}> = [
  { value: 'always', message: 'turnNotificationsAlways' },
  { value: 'unfocused', message: 'turnNotificationsUnfocused' },
  { value: 'never', message: 'turnNotificationsNever' },
];

function SettingsDropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-[220px] items-center justify-between gap-2 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary transition-colors hover:border-border-secondary">
        <span className="truncate">{selected.label}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px]">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function GeneralSection() {
  const intl = useIntl();
  const [menuBarIconEnabled, setMenuBarIconEnabled] = useState(true);
  const [dockIconEnabled, setDockIconEnabled] = useState(true);
  const [wakelockEnabled, setWakelockEnabled] = useState(true);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true);
  const [isMacOS, setIsMacOS] = useState(false);
  const [isDockSwitchDisabled, setIsDockSwitchDisabled] = useState(false);
  const [turnNotifications, setTurnNotifications] = useState<TurnNotificationSetting>('unfocused');
  const [sendShortcut, setSendShortcut] = useState<SendShortcutSetting>('enter');
  const [showBottomPanelControl, setShowBottomPanelControl] = useState(true);
  const [showUsageStats, setShowUsageStats] = useState(true);
  const [toolDetails, setToolDetails] = useState('concise');
  const [language, setLanguage] = useState<LanguageSetting>('system');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    setIsMacOS(window.electron.platform === 'darwin');
  }, []);

  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.electron.getSetting('language').then((value) => setLanguage(value ?? 'system'));
    window.electron.getSetting('responseStyle').then((value) => setToolDetails(value ?? 'concise'));
    window.electron.getSetting('sendShortcut').then((value) => setSendShortcut(value ?? 'enter'));
    window.electron
      .getSetting('showBottomPanelControl')
      .then((value) => setShowBottomPanelControl(value ?? true));
    window.electron.getSetting('showUsageStats').then((value) => setShowUsageStats(value ?? true));
    window.electron
      .getSetting('turnNotifications')
      .then((value) => setTurnNotifications(value ?? 'unfocused'));
    window.electron.getSpellcheckState().then(setSpellcheckEnabled);
  }, []);

  useEffect(() => {
    window.electron.getMenuBarIconState().then((enabled) => {
      setMenuBarIconEnabled(enabled);
    });

    window.electron.getWakelockState().then((enabled) => {
      setWakelockEnabled(enabled);
    });

    if (isMacOS) {
      window.electron.getDockIconState().then((enabled) => {
        setDockIconEnabled(enabled);
      });
    }
  }, [isMacOS]);

  const saveSetting = async <K extends SettingKey>(key: K, value: Settings[K]) => {
    await window.electron.setSetting(key, value);
    window.dispatchEvent(new CustomEvent(AppEvents.SETTINGS_CHANGED));
  };

  const handleMenuBarIconToggle = async () => {
    const newState = !menuBarIconEnabled;
    // If we're turning off the menu bar icon and the dock icon is hidden,
    // we need to show the dock icon to maintain accessibility
    if (!newState && !dockIconEnabled && isMacOS) {
      const success = await window.electron.setDockIcon(true);
      if (success) {
        setDockIconEnabled(true);
      }
    }
    const success = await window.electron.setMenuBarIcon(newState);
    if (success) {
      setMenuBarIconEnabled(newState);
      trackSettingToggled('menu_bar_icon', newState);
    }
  };

  const handleDockIconToggle = async () => {
    const newState = !dockIconEnabled;
    // If we're turning off the dock icon and the menu bar icon is hidden,
    // we need to show the menu bar icon to maintain accessibility
    if (!newState && !menuBarIconEnabled) {
      const success = await window.electron.setMenuBarIcon(true);
      if (success) {
        setMenuBarIconEnabled(true);
      }
    }

    // Disable the switch to prevent rapid toggling
    setIsDockSwitchDisabled(true);
    setTimeout(() => {
      setIsDockSwitchDisabled(false);
    }, 1000);

    // Set the dock icon state
    const success = await window.electron.setDockIcon(newState);
    if (success) {
      setDockIconEnabled(newState);
      trackSettingToggled('dock_icon', newState);
    }
  };

  const handleWakelockToggle = async () => {
    const newState = !wakelockEnabled;
    const success = await window.electron.setWakelock(newState);
    if (success) {
      setWakelockEnabled(newState);
      trackSettingToggled('prevent_sleep', newState);
    }
  };

  const handleBottomPanelToggle = async (checked: boolean) => {
    setShowBottomPanelControl(checked);
    await saveSetting('showBottomPanelControl', checked);
    trackSettingToggled('bottom_panel_control', checked);
  };

  const handleUsageStatsToggle = async (checked: boolean) => {
    setShowUsageStats(checked);
    await saveSetting('showUsageStats', checked);
    trackSettingToggled('usage_stats', checked);
  };

  const handleTurnNotificationsChange = async (value: string) => {
    const next = value as TurnNotificationSetting;
    setTurnNotifications(next);
    await saveSetting('turnNotifications', next);
  };

  const handleSendShortcutChange = async (value: string) => {
    const next = value as SendShortcutSetting;
    setSendShortcut(next);
    await saveSetting('sendShortcut', next);
  };

  const handleSpellcheckToggle = async (checked: boolean) => {
    setSpellcheckEnabled(checked);
    await window.electron.setSpellcheck(checked);
  };

  const handleToolDetailsChange = async (value: string) => {
    setToolDetails(value);
    await saveSetting('responseStyle', value);
  };

  const handleLanguageChange = async (value: string) => {
    const nextLanguage = LANGUAGE_OPTIONS.find((option) => option.value === value)?.value;
    if (!nextLanguage || nextLanguage === language) {
      return;
    }

    setLanguage(nextLanguage);
    try {
      await window.electron.setSetting('language', nextLanguage);
      window.electron.reloadApp();
    } catch (error) {
      console.error('Failed to update language setting:', error);
      setLanguage(language);
    }
  };

  return (
    <div className="pb-8">
      <SettingsSection title={intl.formatMessage(i18n.permissionsTitle)}>
        <SettingsGroup>
          <PermissionsSection />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={intl.formatMessage(i18n.generalTitle)}>
        <SettingsGroup>
          <SettingsRow
            title={intl.formatMessage(i18n.languageTitle)}
            description={intl.formatMessage(i18n.languageDesc)}
          >
            <SettingsDropdown
              value={language}
              onChange={handleLanguageChange}
              options={LANGUAGE_OPTIONS.map((option) => ({
                value: option.value,
                label: intl.formatMessage(i18n[option.message]),
              }))}
            />
          </SettingsRow>

          <SettingsRow
            title={intl.formatMessage(i18n.menuBarIcon)}
            description={intl.formatMessage(i18n.menuBarIconDesc)}
          >
            <Switch
              checked={menuBarIconEnabled}
              onCheckedChange={handleMenuBarIconToggle}
              variant="mono"
            />
          </SettingsRow>

          {isMacOS && (
            <SettingsRow
              title={intl.formatMessage(i18n.dockIcon)}
              description={intl.formatMessage(i18n.dockIconDesc)}
            >
              <Switch
                disabled={isDockSwitchDisabled}
                checked={dockIconEnabled}
                onCheckedChange={handleDockIconToggle}
                variant="mono"
              />
            </SettingsRow>
          )}

          <SettingsRow
            title={intl.formatMessage(i18n.bottomPanel)}
            description={intl.formatMessage(i18n.bottomPanelDesc)}
          >
            <Switch
              checked={showBottomPanelControl}
              onCheckedChange={handleBottomPanelToggle}
              variant="mono"
            />
          </SettingsRow>

          <SettingsRow
            title={intl.formatMessage(i18n.preventSleep)}
            description={intl.formatMessage(i18n.preventSleepDesc)}
          >
            <Switch
              checked={wakelockEnabled}
              onCheckedChange={handleWakelockToggle}
              variant="mono"
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={intl.formatMessage(i18n.composerTitle)}>
        <SettingsGroup>
          <SettingsRow
            title={intl.formatMessage(i18n.sendShortcut)}
            description={intl.formatMessage(i18n.sendShortcutDesc)}
          >
            <SettingsDropdown
              value={sendShortcut}
              onChange={handleSendShortcutChange}
              options={SEND_SHORTCUT_OPTIONS.map((option) => ({
                value: option.value,
                label: intl.formatMessage(i18n[option.message], { mod: isMacOS ? '⌘' : 'Ctrl' }),
              }))}
            />
          </SettingsRow>

          <SettingsRow
            title={intl.formatMessage(i18n.spellcheck)}
            description={intl.formatMessage(i18n.spellcheckDesc)}
          >
            <Switch
              checked={spellcheckEnabled}
              onCheckedChange={handleSpellcheckToggle}
              variant="mono"
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={intl.formatMessage(i18n.chatTitle)}>
        <SettingsGroup>
          <SettingsRow
            title={intl.formatMessage(i18n.toolDetails)}
            description={intl.formatMessage(i18n.toolDetailsDesc)}
          >
            <SettingsDropdown
              value={toolDetails}
              onChange={handleToolDetailsChange}
              options={TOOL_DETAIL_OPTIONS.map((option) => ({
                value: option.value,
                label: intl.formatMessage(i18n[option.message]),
              }))}
            />
          </SettingsRow>

          <SettingsRow
            title={intl.formatMessage(i18n.usageStats)}
            description={intl.formatMessage(i18n.usageStatsDesc)}
          >
            <Switch
              checked={showUsageStats}
              onCheckedChange={handleUsageStatsToggle}
              variant="mono"
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={intl.formatMessage(i18n.notifications)}>
        <SettingsGroup>
          <SettingsRow
            title={intl.formatMessage(i18n.turnNotifications)}
            description={intl.formatMessage(i18n.turnNotificationsDesc)}
          >
            <SettingsDropdown
              value={turnNotifications}
              onChange={handleTurnNotificationsChange}
              options={TURN_NOTIFICATION_OPTIONS.map((option) => ({
                value: option.value,
                label: intl.formatMessage(i18n[option.message]),
              }))}
            />
          </SettingsRow>

          <SettingsRow
            title={intl.formatMessage(i18n.systemNotifications)}
            description={intl.formatMessage(i18n.systemNotificationsDesc)}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await window.electron.openNotificationsSettings();
                } catch (error) {
                  console.error('Failed to open notification settings:', error);
                }
              }}
            >
              {intl.formatMessage(i18n.openSettings)}
            </Button>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <TelemetrySettings />

      <SettingsSection title={intl.formatMessage(i18n.aboutTitle)}>
        <SettingsGroup>
          <SettingsRow
            title={intl.formatMessage(i18n.helpTitle)}
            description={intl.formatMessage(i18n.helpDesc)}
          >
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  window.open(
                    'https://github.com/aaif-goose/goose/issues/new?template=bug_report.md',
                    '_blank'
                  );
                }}
                variant="secondary"
                size="sm"
              >
                {intl.formatMessage(i18n.reportBug)}
              </Button>
              <Button
                onClick={() => {
                  window.open(
                    'https://github.com/aaif-goose/goose/issues/new?template=feature_request.md',
                    '_blank'
                  );
                }}
                variant="secondary"
                size="sm"
              >
                {intl.formatMessage(i18n.requestFeature)}
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow title={intl.formatMessage(i18n.versionTitle)}>
            <div className="flex items-center gap-3">
              <img
                src={isDarkMode ? BlockLogoWhite : BlockLogoBlack}
                alt="Block Logo" // TODO: replace with AAIF logo asset
                className="h-6 w-auto"
              />
              <span className="text-lg font-mono text-text-primary">
                {String(
                  window.appConfig.get('GOOSE_VERSION') ||
                    window.electron.getVersion() ||
                    'Development'
                )}
              </span>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}

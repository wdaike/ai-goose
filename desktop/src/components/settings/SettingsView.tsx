import { ScrollArea } from '../ui/scroll-area';
import { View, ViewOptions } from '../../utils/navigationUtils';
import ModelsSection from './models/ModelsSection';
import ExternalBackendSection from './app/ExternalBackendSection';
import AppSettingsSection from './app/AppSettingsSection';
import ConfigSettings from './config/ConfigSettings';
import PluginsSettingsSection from './plugins/PluginsSettingsSection';
import type { ExtensionConfig } from '../../types/extensions';
import { Z_INDEX } from '../Layout/constants';
import {
  ArrowLeft,
  Bot,
  Share2,
  Monitor,
  MessageSquare,
  Keyboard,
  HardDrive,
  KeyRound,
  Puzzle,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import ChatSettingsSection from './chat/ChatSettingsSection';
import KeyboardShortcutsSection from './keyboard/KeyboardShortcutsSection';
import AuthSettingsSection from './auth/AuthSettingsSection';
import LocalInferenceSection from './localInference/LocalInferenceSection';
import { CONFIGURATION_ENABLED } from '../../updates';
import { trackSettingsTabViewed } from '../../utils/analytics';
import { useFeatures } from '../../contexts/FeaturesContext';
import { defineMessages, useIntl } from '../../i18n';
import { cn } from '../../utils';

const i18n = defineMessages({
  title: {
    id: 'settingsView.title',
    defaultMessage: 'Settings',
  },
  back: {
    id: 'settingsView.back',
    defaultMessage: 'Back to app',
  },
  search: {
    id: 'settingsView.search',
    defaultMessage: 'Search settings...',
  },
  noResults: {
    id: 'settingsView.noResults',
    defaultMessage: 'No settings match your search',
  },
  groupPersonal: {
    id: 'settingsView.groupPersonal',
    defaultMessage: 'Personal',
  },
  groupIntegrations: {
    id: 'settingsView.groupIntegrations',
    defaultMessage: 'Integrations',
  },
  groupAdvanced: {
    id: 'settingsView.groupAdvanced',
    defaultMessage: 'Advanced',
  },
  tabModels: {
    id: 'settingsView.tabModels',
    defaultMessage: 'Models',
  },
  tabLocalInference: {
    id: 'settingsView.tabLocalInference',
    defaultMessage: 'Local Inference',
  },
  tabChat: {
    id: 'settingsView.tabChat',
    defaultMessage: 'Chat',
  },
  tabExternalBackend: {
    id: 'settingsView.tabExternalBackend',
    defaultMessage: 'External Backend',
  },
  tabPrompts: {
    id: 'settingsView.tabPrompts',
    defaultMessage: 'Prompts',
  },
  tabKeyboard: {
    id: 'settingsView.tabKeyboard',
    defaultMessage: 'Keyboard',
  },
  tabAuth: {
    id: 'settingsView.tabAuth',
    defaultMessage: 'Auth',
  },
  tabApp: {
    id: 'settingsView.tabApp',
    defaultMessage: 'App',
  },
  tabPlugins: {
    id: 'settingsView.tabPlugins',
    defaultMessage: 'Plugins',
  },
});

type SettingsTab =
  | 'models'
  | 'local-inference'
  | 'chat'
  | 'app'
  | 'plugins'
  | 'sharing'
  | 'keyboard'
  | 'auth';

type NavItem = {
  tab: SettingsTab;
  label: keyof typeof i18n;
  icon: LucideIcon;
  testId: string;
};

type NavGroup = {
  label: keyof typeof i18n;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'groupPersonal',
    items: [
      { tab: 'models', label: 'tabModels', icon: Bot, testId: 'settings-models-tab' },
      {
        tab: 'local-inference',
        label: 'tabLocalInference',
        icon: HardDrive,
        testId: 'settings-local-inference-tab',
      },
      { tab: 'chat', label: 'tabChat', icon: MessageSquare, testId: 'settings-chat-tab' },
      { tab: 'app', label: 'tabApp', icon: Monitor, testId: 'settings-app-tab' },
    ],
  },
  {
    label: 'groupIntegrations',
    items: [
      {
        tab: 'plugins',
        label: 'tabPlugins',
        icon: Puzzle,
        testId: 'settings-plugins-tab',
      },
      {
        tab: 'sharing',
        label: 'tabExternalBackend',
        icon: Share2,
        testId: 'settings-sharing-tab',
      },
    ],
  },
  {
    label: 'groupAdvanced',
    items: [
      { tab: 'keyboard', label: 'tabKeyboard', icon: Keyboard, testId: 'settings-keyboard-tab' },
      { tab: 'auth', label: 'tabAuth', icon: KeyRound, testId: 'settings-auth-tab' },
    ],
  },
];

export type SettingsViewOptions = {
  deepLinkConfig?: ExtensionConfig;
  showEnvVars?: boolean;
  section?: string;
};

export default function SettingsView({
  onClose,
  setView,
  viewOptions,
}: {
  onClose: () => void;
  setView: (view: View, viewOptions?: ViewOptions) => void;
  viewOptions: SettingsViewOptions;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');
  const [search, setSearch] = useState('');
  const hasTrackedInitialTab = useRef(false);
  const { localInference } = useFeatures();
  const intl = useIntl();

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    trackSettingsTabViewed(tab);
  };

  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.tab === 'local-inference' && !localInference) return false;
        return !query || intl.formatMessage(i18n[item.label]).toLowerCase().includes(query);
      }),
    })).filter((group) => group.items.length > 0);
  }, [search, localInference, intl]);

  const activeItem = NAV_GROUPS.flatMap((group) => group.items).find(
    (item) => item.tab === activeTab
  );

  // Determine initial tab based on section prop
  useEffect(() => {
    if (viewOptions.section) {
      // Map section names to tab values
      const sectionToTab: Record<string, SettingsTab> = {
        update: 'app',
        models: 'models',
        modes: 'chat',
        sharing: 'sharing',
        styles: 'chat',
        tools: 'chat',
        app: 'app',
        chat: 'chat',
        extensions: 'plugins',
        skills: 'plugins',
        plugins: 'plugins',
        keyboard: 'keyboard',
        auth: 'auth',
        'local-inference': 'local-inference',
      };

      const targetTab = sectionToTab[viewOptions.section];
      if (targetTab && (targetTab !== 'local-inference' || localInference)) {
        setActiveTab(targetTab);
      }
    }
  }, [viewOptions.section, localInference]);

  // Reset active tab if local-inference becomes unavailable
  useEffect(() => {
    if (!localInference && activeTab === 'local-inference') {
      setActiveTab('models');
    }
  }, [localInference, activeTab]);

  useEffect(() => {
    if (!hasTrackedInitialTab.current) {
      trackSettingsTabViewed(activeTab);
      hasTrackedInitialTab.current = true;
    }
  }, [activeTab]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex bg-background-primary animate-fade-in"
      style={{ zIndex: Z_INDEX.FULL_WINDOW_VIEW }}
    >
      <div className="flex flex-1 min-h-0">
        <nav className="flex flex-col w-[260px] shrink-0 border-r border-border-primary bg-background-secondary">
          {/* Drag region clearing the window controls. */}
          <div className="h-[52px]" />

          <div className="px-4">
            <button
              onClick={onClose}
              className="no-drag flex items-center gap-2 h-9 px-2 -ml-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">{intl.formatMessage(i18n.back)}</span>
            </button>
          </div>

          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={intl.formatMessage(i18n.search)}
                data-testid="settings-search"
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-primary bg-background-primary text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-secondary focus-visible:outline-none transition-colors"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-3 pb-6 space-y-5">
              {visibleGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pb-1 text-xs text-text-tertiary">
                    {intl.formatMessage(i18n[group.label])}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.tab === activeTab;
                    return (
                      <button
                        key={item.tab}
                        onClick={() => handleTabChange(item.tab)}
                        data-testid={item.testId}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'w-full flex items-center gap-3 h-9 px-3 rounded-lg text-sm transition-colors',
                          isActive
                            ? 'bg-background-tertiary text-text-primary'
                            : 'text-text-secondary hover:bg-background-tertiary/60 hover:text-text-primary'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{intl.formatMessage(i18n[item.label])}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {visibleGroups.length === 0 && (
                <div className="px-3 py-6 text-sm text-text-tertiary">
                  {intl.formatMessage(i18n.noResults)}
                </div>
              )}
            </div>
          </ScrollArea>
        </nav>

        <main className="flex-1 min-w-0 flex flex-col pt-[52px]">
          <ScrollArea className="flex-1">
            <div className="mx-auto w-full max-w-[840px] px-10 py-10 page-transition">
              <h1 className="text-3xl font-light mb-8">
                {activeItem
                  ? intl.formatMessage(i18n[activeItem.label])
                  : intl.formatMessage(i18n.title)}
              </h1>

              {activeTab === 'models' && <ModelsSection setView={setView} />}
              {activeTab === 'local-inference' && localInference && <LocalInferenceSection />}
              {activeTab === 'chat' && <ChatSettingsSection />}
              {activeTab === 'plugins' && (
                <PluginsSettingsSection
                  deepLinkConfig={viewOptions.deepLinkConfig}
                  showEnvVars={viewOptions.showEnvVars}
                  initialTab={viewOptions.section === 'skills' ? 'skills' : 'mcps'}
                />
              )}
              {activeTab === 'sharing' && <ExternalBackendSection />}
              {activeTab === 'keyboard' && <KeyboardShortcutsSection />}
              {activeTab === 'auth' && <AuthSettingsSection />}
              {activeTab === 'app' && (
                <div className="space-y-8">
                  {CONFIGURATION_ENABLED && <ConfigSettings />}
                  <AppSettingsSection scrollToSection={viewOptions.section} />
                </div>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}

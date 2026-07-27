import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import kebabCase from 'lodash/kebabCase';
import {
  AlertCircle,
  Blocks,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Waypoints,
  Zap,
} from 'lucide-react';
import type { ExtensionConfig } from '../../../types/extensions';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import { Skeleton } from '../../ui/skeleton';
import { Gear } from '../../icons';
import { useConfig, FixedExtensionEntry } from '../../ConfigContext';
import { errorMessage } from '../../../utils/conversionUtils';
import { getInitialWorkingDir } from '../../../utils/workingDir';
import {
  listManagedSkills,
  personalSkillsRoot,
  setSkillEnabled,
  uninstallSkill,
} from '../../../codex/engine/skillPolicy';
import type { SkillMetadata } from '../../../codex/protocol/v2/SkillMetadata';
import {
  listPlugins,
  setPluginEnabled,
  uninstallPlugin,
  addMarketplace,
} from '../../../codex/engine/pluginCatalog';
import PluginDetails from '../../plugins/PluginDetails';
import { PluginLogo } from '../../plugins/logos';
import type { PluginSummary } from '../../../codex/protocol/v2/PluginSummary';
import type { PluginMarketplaceEntry } from '../../../codex/protocol/v2/PluginMarketplaceEntry';
import { listApps, setAppEnabled } from '../../../codex/engine/appCatalog';
import type { AppInfo } from '../../../codex/protocol/v2/AppInfo';
import { useTheme } from '../../../contexts/ThemeContext';
import SkillDetailsModal, { openSkillFolder } from '../../plugins/SkillDetailsModal';
import { BaseModal } from '../../ui/BaseModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Input } from '../../ui/input';
import ExtensionModal from '../extensions/modal/ExtensionModal';
import {
  createExtensionConfig,
  extensionToFormData,
  getDefaultFormData,
  getFriendlyTitle,
  getSubtitle,
  nameToKey,
  type ExtensionFormData,
} from '../extensions/utils';
import { activateExtensionDefault, deleteExtension, toggleExtensionDefault } from '../extensions';
import { defineMessages, useIntl } from '../../../i18n';
import { cn } from '../../../utils';

const i18n = defineMessages({
  subtitle: {
    id: 'pluginsSettings.subtitle',
    defaultMessage: 'Manage plugins, apps, MCPs, and skills',
  },
  tabApps: {
    id: 'pluginsSettings.tabApps',
    defaultMessage: 'Apps',
  },
  searchApps: {
    id: 'pluginsSettings.searchApps',
    defaultMessage: 'Search apps',
  },
  noApps: {
    id: 'pluginsSettings.noApps',
    defaultMessage: 'No apps available',
  },
  noAppsDescription: {
    id: 'pluginsSettings.noAppsDescription',
    defaultMessage: 'Apps are connectors published by Codex; none are available for this account.',
  },
  errorLoadingApps: {
    id: 'pluginsSettings.errorLoadingApps',
    defaultMessage: 'Error loading apps',
  },
  appUnavailable: {
    id: 'pluginsSettings.appUnavailable',
    defaultMessage: 'Unavailable',
  },
  tabMcps: {
    id: 'pluginsSettings.tabMcps',
    defaultMessage: 'MCPs',
  },
  tabSkills: {
    id: 'pluginsSettings.tabSkills',
    defaultMessage: 'Skills',
  },
  searchMcps: {
    id: 'pluginsSettings.searchMcps',
    defaultMessage: 'Search MCPs',
  },
  searchSkills: {
    id: 'pluginsSettings.searchSkills',
    defaultMessage: 'Search skills',
  },
  add: {
    id: 'pluginsSettings.add',
    defaultMessage: 'Add',
  },
  scopeBuiltIn: {
    id: 'pluginsSettings.scopeBuiltIn',
    defaultMessage: 'Built-in',
  },
  scopePersonal: {
    id: 'pluginsSettings.scopePersonal',
    defaultMessage: 'Personal',
  },
  scopeProject: {
    id: 'pluginsSettings.scopeProject',
    defaultMessage: 'Project',
  },
  scopeSystem: {
    id: 'pluginsSettings.scopeSystem',
    defaultMessage: 'System',
  },
  noExtensions: {
    id: 'pluginsSettings.noExtensions',
    defaultMessage: 'No extensions installed',
  },
  noSkills: {
    id: 'pluginsSettings.noSkills',
    defaultMessage: 'No skills installed',
  },
  noSkillsDescription: {
    id: 'pluginsSettings.noSkillsDescription',
    defaultMessage: 'Skills are loaded from SKILL.md files in the iCodex skills directory.',
  },
  noMatches: {
    id: 'pluginsSettings.noMatches',
    defaultMessage: 'No results for "{query}"',
  },
  errorLoadingSkills: {
    id: 'pluginsSettings.errorLoadingSkills',
    defaultMessage: 'Error loading skills',
  },
  tryAgain: {
    id: 'pluginsSettings.tryAgain',
    defaultMessage: 'Try Again',
  },
  addCustomExtension: {
    id: 'pluginsSettings.addCustomExtension',
    defaultMessage: 'Add custom extension',
  },
  updateExtension: {
    id: 'pluginsSettings.updateExtension',
    defaultMessage: 'Update Extension',
  },
  saveChanges: {
    id: 'pluginsSettings.saveChanges',
    defaultMessage: 'Save Changes',
  },
  addExtension: {
    id: 'pluginsSettings.addExtension',
    defaultMessage: 'Add Extension',
  },
  configureExtension: {
    id: 'pluginsSettings.configureExtension',
    defaultMessage: 'Configure {name}',
  },
  toggleItem: {
    id: 'pluginsSettings.toggleItem',
    defaultMessage: 'Toggle {name} on or off',
  },
  moreActions: {
    id: 'pluginsSettings.moreActions',
    defaultMessage: 'More actions for {name}',
  },
  open: {
    id: 'pluginsSettings.open',
    defaultMessage: 'Open',
  },
  details: {
    id: 'pluginsSettings.details',
    defaultMessage: 'Details',
  },
  tabPlugins: {
    id: 'pluginsSettings.tabPlugins',
    defaultMessage: 'Plugins',
  },
  searchPlugins: {
    id: 'pluginsSettings.searchPlugins',
    defaultMessage: 'Search plugins',
  },
  noPlugins: {
    id: 'pluginsSettings.noPlugins',
    defaultMessage: 'No plugins installed',
  },
  noPluginsDescription: {
    id: 'pluginsSettings.noPluginsDescription',
    defaultMessage: 'Browse and install plugins from the Plugins page.',
  },
  errorLoadingPlugins: {
    id: 'pluginsSettings.errorLoadingPlugins',
    defaultMessage: 'Error loading plugins',
  },
  uninstallPlugin: {
    id: 'pluginsSettings.uninstallPlugin',
    defaultMessage: 'Uninstall {name}',
  },
  disabledByAdmin: {
    id: 'pluginsSettings.disabledByAdmin',
    defaultMessage: 'Disabled by admin',
  },
  addMarketplace: {
    id: 'pluginsSettings.addMarketplace',
    defaultMessage: 'Add marketplace',
  },
  addMarketplaceTitle: {
    id: 'pluginsSettings.addMarketplaceTitle',
    defaultMessage: 'Add plugin marketplace',
  },
  marketplaceSourcePlaceholder: {
    id: 'pluginsSettings.marketplaceSourcePlaceholder',
    defaultMessage: 'git URL or local path',
  },
  cancel: {
    id: 'pluginsSettings.cancel',
    defaultMessage: 'Cancel',
  },
});

type PluginsTab = 'plugins' | 'apps' | 'mcps' | 'skills';

const SEARCH_PLACEHOLDER: Record<PluginsTab, typeof i18n.searchPlugins> = {
  plugins: i18n.searchPlugins,
  apps: i18n.searchApps,
  mcps: i18n.searchMcps,
  skills: i18n.searchSkills,
};

function scrollToExtension(extensionName: string) {
  setTimeout(() => {
    const element = document.getElementById(`extension-${kebabCase(extensionName)}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.5)';
    setTimeout(() => {
      element.style.boxShadow = '';
    }, 2000);
  }, 200);
}

function PluginRow({
  id,
  icon,
  title,
  description,
  scope,
  actions,
  onOpen,
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  description: string | null;
  scope: string;
  actions: ReactNode;
  /** Set for rows that have a detail view; the row body becomes the link to it. */
  onOpen?: () => void;
}) {
  const body = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-primary bg-background-secondary text-text-secondary">
        {icon}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-base text-text-primary truncate">{title}</div>
        {description && (
          <div className="text-sm text-text-secondary truncate mt-0.5">{description}</div>
        )}
      </div>
    </>
  );

  return (
    <div
      id={id}
      className="group flex items-center gap-4 py-4 px-3 -mx-3 rounded-xl transition-colors hover:bg-background-secondary"
    >
      {onOpen ? (
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4">
          {body}
        </button>
      ) : (
        body
      )}
      <div className="shrink-0 text-sm text-text-secondary">{scope}</div>
      <div className="flex shrink-0 items-center gap-3">{actions}</div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-4">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-1/3 mb-2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function ExtensionRow({
  extension,
  onToggle,
  onConfigure,
}: {
  extension: FixedExtensionEntry;
  onToggle: (extension: FixedExtensionEntry) => Promise<void>;
  onConfigure: (extension: FixedExtensionEntry) => void;
}) {
  const intl = useIntl();
  const [visuallyEnabled, setVisuallyEnabled] = useState(extension.enabled);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (!isToggling) {
      setVisuallyEnabled(extension.enabled);
    }
  }, [extension.enabled, isToggling]);

  const handleToggle = async () => {
    if (isToggling) return;
    setIsToggling(true);
    setVisuallyEnabled(!extension.enabled);
    try {
      await onToggle(extension);
    } catch {
      setVisuallyEnabled(extension.enabled);
    } finally {
      setIsToggling(false);
    }
  };

  const title = getFriendlyTitle(extension);
  const { description, command } = getSubtitle(extension);
  const builtIn = extension.type === 'builtin' || ('bundled' in extension && !!extension.bundled);

  return (
    <PluginRow
      id={`extension-${kebabCase(extension.name)}`}
      icon={<Blocks className="h-5 w-5" />}
      title={title}
      description={description || command}
      scope={intl.formatMessage(builtIn ? i18n.scopeBuiltIn : i18n.scopePersonal)}
      actions={
        <>
          {!builtIn && (
            <button
              className="text-text-secondary opacity-0 group-hover:opacity-100 hover:text-text-primary transition-opacity"
              aria-label={intl.formatMessage(i18n.configureExtension, { name: title })}
              onClick={() => onConfigure(extension)}
            >
              <Gear className="w-4 h-4" />
            </button>
          )}
          <Switch
            checked={visuallyEnabled}
            onCheckedChange={handleToggle}
            disabled={isToggling}
            variant="mono"
            aria-label={intl.formatMessage(i18n.toggleItem, { name: title })}
          />
        </>
      }
    />
  );
}

function SkillRow({
  skill,
  onToggle,
  onShowDetails,
}: {
  skill: SkillMetadata;
  onToggle: (skill: SkillMetadata, enabled: boolean) => Promise<void>;
  onShowDetails: (skill: SkillMetadata) => void;
}) {
  const intl = useIntl();
  const [visuallyEnabled, setVisuallyEnabled] = useState(skill.enabled);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (!isToggling) {
      setVisuallyEnabled(skill.enabled);
    }
  }, [skill.enabled, isToggling]);

  const handleToggle = async () => {
    if (isToggling) return;
    setIsToggling(true);
    const next = !visuallyEnabled;
    setVisuallyEnabled(next);
    try {
      await onToggle(skill, next);
    } catch {
      setVisuallyEnabled(!next);
    } finally {
      setIsToggling(false);
    }
  };

  const scope =
    skill.scope === 'repo'
      ? i18n.scopeProject
      : skill.scope === 'system' || skill.scope === 'admin'
        ? i18n.scopeSystem
        : i18n.scopePersonal;

  return (
    <PluginRow
      icon={<Zap className="h-5 w-5" />}
      title={skill.name}
      description={skill.description}
      scope={intl.formatMessage(scope)}
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={intl.formatMessage(i18n.moreActions, { name: skill.name })}
                className="rounded-lg p-1.5 text-text-secondary opacity-0 transition-opacity hover:bg-background-tertiary hover:text-text-primary group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[9rem]">
              <DropdownMenuItem onSelect={() => openSkillFolder(skill)}>
                {intl.formatMessage(i18n.open)}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onShowDetails(skill)}>
                {intl.formatMessage(i18n.details)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Switch
            checked={visuallyEnabled}
            onCheckedChange={handleToggle}
            disabled={isToggling}
            variant="mono"
            aria-label={intl.formatMessage(i18n.toggleItem, { name: skill.name })}
          />
        </>
      }
    />
  );
}

function AppRow({
  app,
  onToggle,
}: {
  app: AppInfo;
  onToggle: (app: AppInfo, enabled: boolean) => Promise<void>;
}) {
  const intl = useIntl();
  const { resolvedTheme } = useTheme();
  const [visuallyEnabled, setVisuallyEnabled] = useState(app.isEnabled);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (!isToggling) setVisuallyEnabled(app.isEnabled);
  }, [app.isEnabled, isToggling]);

  const handleToggle = async () => {
    if (isToggling) return;
    setIsToggling(true);
    const next = !visuallyEnabled;
    setVisuallyEnabled(next);
    try {
      await onToggle(app, next);
    } catch {
      setVisuallyEnabled(!next);
    } finally {
      setIsToggling(false);
    }
  };

  const logoUrl = (resolvedTheme === 'dark' ? app.logoUrlDark : null) ?? app.logoUrl;

  return (
    <PluginRow
      icon={
        logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <Waypoints className="h-5 w-5" />
        )
      }
      title={app.name}
      description={app.description}
      scope={app.isAccessible ? '' : intl.formatMessage(i18n.appUnavailable)}
      actions={
        <Switch
          checked={visuallyEnabled}
          onCheckedChange={handleToggle}
          disabled={isToggling || !app.isAccessible}
          variant="mono"
          aria-label={intl.formatMessage(i18n.toggleItem, { name: app.name })}
        />
      }
    />
  );
}

function InstalledPluginRow({
  marketplaceName,
  plugin,
  onToggle,
  onUninstall,
  onOpen,
}: {
  marketplaceName: string;
  plugin: PluginSummary;
  onToggle: (plugin: PluginSummary, enabled: boolean) => Promise<void>;
  onUninstall: (plugin: PluginSummary) => Promise<void>;
  onOpen: () => void;
}) {
  const intl = useIntl();
  const [visuallyEnabled, setVisuallyEnabled] = useState(plugin.enabled);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!busy) setVisuallyEnabled(plugin.enabled);
  }, [plugin.enabled, busy]);

  const title = plugin.interface?.displayName || plugin.name;
  const description = plugin.interface?.shortDescription ?? null;
  const disabledByAdmin = plugin.availability === 'DISABLED_BY_ADMIN';

  const runBusy = async (action: () => Promise<void>, revert?: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch {
      revert?.();
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = () => {
    const next = !visuallyEnabled;
    setVisuallyEnabled(next);
    return runBusy(
      () => onToggle(plugin, next),
      () => setVisuallyEnabled(!next)
    );
  };

  return (
    <PluginRow
      icon={<PluginLogo plugin={plugin} className="h-full w-full" />}
      title={title}
      description={description}
      scope={marketplaceName}
      onOpen={onOpen}
      actions={
        disabledByAdmin ? (
          <span className="text-sm text-text-tertiary">
            {intl.formatMessage(i18n.disabledByAdmin)}
          </span>
        ) : (
          <>
            <button
              className="text-text-secondary opacity-0 group-hover:opacity-100 hover:text-text-danger transition-opacity disabled:opacity-30"
              aria-label={intl.formatMessage(i18n.uninstallPlugin, { name: title })}
              onClick={() => runBusy(() => onUninstall(plugin))}
              disabled={busy}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <Switch
              checked={visuallyEnabled}
              onCheckedChange={handleToggle}
              disabled={busy}
              variant="mono"
              aria-label={intl.formatMessage(i18n.toggleItem, { name: title })}
            />
          </>
        )
      }
    />
  );
}

export interface PluginsSettingsSectionProps {
  deepLinkConfig?: ExtensionConfig;
  showEnvVars?: boolean;
  initialTab?: PluginsTab;
}

export default function PluginsSettingsSection({
  deepLinkConfig,
  showEnvVars,
  initialTab = 'mcps',
}: PluginsSettingsSectionProps) {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState<PluginsTab>(initialTab);
  const [search, setSearch] = useState('');

  const { getExtensions, addExtension, removeExtension, setExtensionEnabled, extensionsList } =
    useConfig();
  const [selectedExtension, setSelectedExtension] = useState<FixedExtensionEntry | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deepLinkModalConfig, setDeepLinkModalConfig] = useState<ExtensionConfig | null>(
    deepLinkConfig && showEnvVars ? deepLinkConfig : null
  );

  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [detailsSkillPath, setDetailsSkillPath] = useState<string | null>(null);
  const [skillsRoot, setSkillsRoot] = useState('');

  const [pluginMarkets, setPluginMarkets] = useState<PluginMarketplaceEntry[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(true);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const [isAddMarketplaceOpen, setIsAddMarketplaceOpen] = useState(false);
  const [marketplaceSource, setMarketplaceSource] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<{
    market: PluginMarketplaceEntry;
    plugin: PluginSummary;
  } | null>(null);

  const [apps, setApps] = useState<AppInfo[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState<string | null>(null);

  useEffect(() => {
    if (deepLinkConfig) {
      if (showEnvVars) {
        setDeepLinkModalConfig(deepLinkConfig);
      } else {
        scrollToExtension(deepLinkConfig.name);
      }
    }
  }, [deepLinkConfig, showEnvVars]);

  const loadSkills = useCallback(async () => {
    try {
      setSkillsLoading(true);
      setSkillsError(null);
      setSkills(await listManagedSkills(getInitialWorkingDir()));
    } catch (err) {
      setSkillsError(errorMessage(err, 'Failed to load skills'));
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
    personalSkillsRoot().then(setSkillsRoot).catch(console.error);
  }, [loadSkills]);

  const loadPlugins = useCallback(async () => {
    try {
      setPluginsLoading(true);
      setPluginsError(null);
      const listing = await listPlugins(getInitialWorkingDir());
      setPluginMarkets(listing.marketplaces);
    } catch (err) {
      setPluginsError(errorMessage(err, 'Failed to load plugins'));
    } finally {
      setPluginsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const loadApps = useCallback(async () => {
    try {
      setAppsLoading(true);
      setAppsError(null);
      setApps(await listApps());
    } catch (err) {
      setAppsError(errorMessage(err, 'Failed to load apps'));
    } finally {
      setAppsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const extensions = useMemo(
    () =>
      [...extensionsList].sort((a, b) => getFriendlyTitle(a).localeCompare(getFriendlyTitle(b))),
    [extensionsList]
  );

  const query = search.trim().toLowerCase();

  const filteredExtensions = useMemo(() => {
    if (!query) return extensions;
    return extensions.filter((ext) => {
      const { description, command } = getSubtitle(ext);
      return [getFriendlyTitle(ext), ext.name, description, command].some((text) =>
        text?.toLowerCase().includes(query)
      );
    });
  }, [extensions, query]);

  const filteredSkills = useMemo(() => {
    if (!query) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query)
    );
  }, [skills, query]);

  // Settings manages what is already installed; browsing and installing lives on
  // the Plugins page.
  const pluginRows = useMemo(
    () =>
      pluginMarkets
        .flatMap((market) => market.plugins.map((plugin) => ({ market, plugin })))
        .filter(({ plugin }) => plugin.installed)
        .sort((a, b) =>
          (a.plugin.interface?.displayName || a.plugin.name).localeCompare(
            b.plugin.interface?.displayName || b.plugin.name
          )
        ),
    [pluginMarkets]
  );

  const filteredPlugins = useMemo(() => {
    if (!query) return pluginRows;
    return pluginRows.filter(({ plugin }) => {
      const title = plugin.interface?.displayName || plugin.name;
      return [title, plugin.name, plugin.interface?.shortDescription].some((text) =>
        text?.toLowerCase().includes(query)
      );
    });
  }, [pluginRows, query]);

  const filteredApps = useMemo(() => {
    if (!query) return apps;
    return apps.filter((app) =>
      [app.name, app.description].some((text) => text?.toLowerCase().includes(query))
    );
  }, [apps, query]);

  const fetchExtensions = useCallback(async () => {
    await getExtensions(true);
  }, [getExtensions]);

  const handleExtensionToggle = async (extension: FixedExtensionEntry) => {
    const configKey = extension.configKey ?? nameToKey(extension.name);
    await toggleExtensionDefault({
      toggle: extension.enabled ? 'toggleOff' : 'toggleOn',
      extensionConfig: extension,
      setEnabled: (enabled) => setExtensionEnabled(configKey, enabled),
    });
    await fetchExtensions();
  };

  const handleSkillToggle = async (skill: SkillMetadata, enabled: boolean) => {
    await setSkillEnabled(skill.path, enabled);
    setSkills((prev) => prev.map((s) => (s.path === skill.path ? { ...s, enabled } : s)));
  };

  const detailsSkill = skills.find((skill) => skill.path === detailsSkillPath) ?? null;

  const isPersonalSkill = (skill: SkillMetadata) =>
    skillsRoot !== '' &&
    skill.path.startsWith(`${skillsRoot}/`) &&
    !skill.path.startsWith(`${skillsRoot}/.system/`);

  const handleSkillUninstall = async (skill: SkillMetadata) => {
    await uninstallSkill(skill.path);
    setDetailsSkillPath(null);
    await loadSkills();
  };

  const handlePluginToggle = async (plugin: PluginSummary, enabled: boolean) => {
    await setPluginEnabled(plugin.id, enabled);
    setPluginMarkets((prev) =>
      prev.map((market) => ({
        ...market,
        plugins: market.plugins.map((p) => (p.id === plugin.id ? { ...p, enabled } : p)),
      }))
    );
  };

  const handleAppToggle = async (app: AppInfo, enabled: boolean) => {
    await setAppEnabled(app.id, enabled);
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, isEnabled: enabled } : a)));
  };

  const handlePluginUninstall = async (plugin: PluginSummary) => {
    await uninstallPlugin(plugin.id);
    await loadPlugins();
  };

  const handleAddMarketplace = async () => {
    const source = marketplaceSource.trim();
    if (!source) return;
    setIsAddMarketplaceOpen(false);
    setMarketplaceSource('');
    try {
      await addMarketplace(source);
    } catch (error) {
      setPluginsError(errorMessage(error, 'Failed to add marketplace'));
    } finally {
      await loadPlugins();
    }
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
    setSelectedExtension(null);
    setDeepLinkModalConfig(null);
  };

  const handleAddExtension = async (formData: ExtensionFormData) => {
    handleModalClose();
    try {
      await activateExtensionDefault({
        addToConfig: addExtension,
        extensionConfig: createExtensionConfig(formData),
      });
    } catch (error) {
      console.error('Failed to add extension:', error);
    } finally {
      await fetchExtensions();
      scrollToExtension(formData.name);
    }
  };

  const handleUpdateExtension = async (formData: ExtensionFormData) => {
    if (!selectedExtension) return;
    const originalName = selectedExtension.name;
    handleModalClose();
    try {
      if (originalName !== formData.name) {
        await removeExtension(originalName);
      }
      const extensionConfig = createExtensionConfig(formData);
      await addExtension(extensionConfig.name, extensionConfig, formData.enabled);
    } catch (error) {
      console.error('Failed to update extension:', error);
    } finally {
      await fetchExtensions();
    }
  };

  const handleDeleteExtension = async (name: string) => {
    handleModalClose();
    try {
      await deleteExtension({ name, removeFromConfig: removeExtension });
    } catch (error) {
      console.error('Failed to delete extension:', error);
    } finally {
      await fetchExtensions();
    }
  };

  const tabs: { tab: PluginsTab; label: string; count: number }[] = [
    { tab: 'plugins', label: intl.formatMessage(i18n.tabPlugins), count: pluginRows.length },
    { tab: 'apps', label: intl.formatMessage(i18n.tabApps), count: apps.length },
    { tab: 'mcps', label: intl.formatMessage(i18n.tabMcps), count: extensions.length },
    { tab: 'skills', label: intl.formatMessage(i18n.tabSkills), count: skills.length },
  ];

  const renderNoMatches = () => (
    <div className="py-12 text-center text-sm text-text-secondary">
      {intl.formatMessage(i18n.noMatches, { query: search.trim() })}
    </div>
  );

  const renderMcps = () => {
    if (extensions.length === 0) {
      return (
        <div className="py-12 text-center text-sm text-text-secondary">
          {intl.formatMessage(i18n.noExtensions)}
        </div>
      );
    }
    if (filteredExtensions.length === 0) return renderNoMatches();
    return (
      <div>
        {filteredExtensions.map((extension) => (
          <ExtensionRow
            key={extension.name}
            extension={extension}
            onToggle={handleExtensionToggle}
            onConfigure={(ext) => setSelectedExtension(ext)}
          />
        ))}
      </div>
    );
  };

  const renderSkills = () => {
    if (skillsLoading) {
      return (
        <div>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      );
    }
    if (skillsError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
          <AlertCircle className="h-10 w-10 text-text-danger mb-3" />
          <p className="mb-1">{intl.formatMessage(i18n.errorLoadingSkills)}</p>
          <p className="text-sm mb-4">{skillsError}</p>
          <Button onClick={loadSkills} variant="default">
            {intl.formatMessage(i18n.tryAgain)}
          </Button>
        </div>
      );
    }
    if (skills.length === 0) {
      return (
        <div className="py-12 text-center text-text-secondary">
          <p className="mb-1">{intl.formatMessage(i18n.noSkills)}</p>
          <p className="text-sm">{intl.formatMessage(i18n.noSkillsDescription)}</p>
        </div>
      );
    }
    if (filteredSkills.length === 0) return renderNoMatches();
    return (
      <div>
        {filteredSkills.map((skill) => (
          <SkillRow
            key={skill.path}
            skill={skill}
            onToggle={handleSkillToggle}
            onShowDetails={(target) => setDetailsSkillPath(target.path)}
          />
        ))}
      </div>
    );
  };

  const renderPlugins = () => {
    if (pluginsLoading) {
      return (
        <div>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      );
    }
    if (pluginsError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
          <AlertCircle className="h-10 w-10 text-text-danger mb-3" />
          <p className="mb-1">{intl.formatMessage(i18n.errorLoadingPlugins)}</p>
          <p className="text-sm mb-4">{pluginsError}</p>
          <Button onClick={loadPlugins} variant="default">
            {intl.formatMessage(i18n.tryAgain)}
          </Button>
        </div>
      );
    }
    if (pluginRows.length === 0) {
      return (
        <div className="py-12 text-center text-text-secondary">
          <p className="mb-1">{intl.formatMessage(i18n.noPlugins)}</p>
          <p className="text-sm">{intl.formatMessage(i18n.noPluginsDescription)}</p>
        </div>
      );
    }
    if (filteredPlugins.length === 0) return renderNoMatches();
    return (
      <div>
        {filteredPlugins.map(({ market, plugin }) => (
          <InstalledPluginRow
            key={plugin.id}
            marketplaceName={market.interface?.displayName || market.name}
            plugin={plugin}
            onToggle={handlePluginToggle}
            onUninstall={handlePluginUninstall}
            onOpen={() => setSelectedPlugin({ market, plugin })}
          />
        ))}
      </div>
    );
  };

  const renderApps = () => {
    if (appsLoading) {
      return (
        <div>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      );
    }
    if (appsError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
          <AlertCircle className="h-10 w-10 text-text-danger mb-3" />
          <p className="mb-1">{intl.formatMessage(i18n.errorLoadingApps)}</p>
          <p className="text-sm mb-4">{appsError}</p>
          <Button onClick={loadApps} variant="default">
            {intl.formatMessage(i18n.tryAgain)}
          </Button>
        </div>
      );
    }
    if (apps.length === 0) {
      return (
        <div className="py-12 text-center text-text-secondary">
          <p className="mb-1">{intl.formatMessage(i18n.noApps)}</p>
          <p className="text-sm">{intl.formatMessage(i18n.noAppsDescription)}</p>
        </div>
      );
    }
    if (filteredApps.length === 0) return renderNoMatches();
    return (
      <div>
        {filteredApps.map((app) => (
          <AppRow key={app.id} app={app} onToggle={handleAppToggle} />
        ))}
      </div>
    );
  };

  if (selectedPlugin) {
    return (
      <div className="-mt-6">
        <PluginDetails
          market={selectedPlugin.market}
          plugin={selectedPlugin.plugin}
          breadcrumb={intl.formatMessage(i18n.tabPlugins)}
          onBack={() => setSelectedPlugin(null)}
          onChanged={loadPlugins}
        />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <p className="text-text-secondary -mt-6 mb-8">{intl.formatMessage(i18n.subtitle)}</p>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-1">
          {tabs.map(({ tab, label, count }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`plugins-tab-${tab}`}
              aria-current={activeTab === tab ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 h-9 px-4 rounded-full text-sm transition-colors',
                activeTab === tab
                  ? 'bg-background-tertiary text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <span>{label}</span>
              <span className={activeTab === tab ? 'text-text-secondary' : 'text-text-tertiary'}>
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={intl.formatMessage(SEARCH_PLACEHOLDER[activeTab])}
              data-testid="plugins-search"
              className="w-[240px] h-9 pl-9 pr-3 rounded-full border border-border-primary bg-background-primary text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-secondary focus-visible:outline-none transition-colors"
            />
          </div>
          {activeTab === 'mcps' && (
            <Button
              variant="secondary"
              className="h-9 rounded-full flex items-center gap-1.5"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {intl.formatMessage(i18n.add)}
            </Button>
          )}
          {activeTab === 'plugins' && (
            <Button
              variant="secondary"
              className="h-9 rounded-full flex items-center gap-1.5"
              onClick={() => setIsAddMarketplaceOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {intl.formatMessage(i18n.addMarketplace)}
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'mcps'
        ? renderMcps()
        : activeTab === 'skills'
          ? renderSkills()
          : activeTab === 'apps'
            ? renderApps()
            : renderPlugins()}

      <SkillDetailsModal
        skill={detailsSkill}
        onClose={() => setDetailsSkillPath(null)}
        onToggle={handleSkillToggle}
        onUninstall={
          detailsSkill && isPersonalSkill(detailsSkill) ? handleSkillUninstall : undefined
        }
      />

      {selectedExtension && (
        <ExtensionModal
          title={intl.formatMessage(i18n.updateExtension)}
          initialData={extensionToFormData(selectedExtension)}
          onClose={handleModalClose}
          onSubmit={handleUpdateExtension}
          onDelete={handleDeleteExtension}
          submitLabel={intl.formatMessage(i18n.saveChanges)}
          modalType={'edit'}
        />
      )}

      {isAddModalOpen && (
        <ExtensionModal
          title={intl.formatMessage(i18n.addCustomExtension)}
          initialData={getDefaultFormData()}
          onClose={handleModalClose}
          onSubmit={handleAddExtension}
          submitLabel={intl.formatMessage(i18n.addExtension)}
          modalType={'add'}
        />
      )}

      {deepLinkModalConfig && (
        <ExtensionModal
          title={intl.formatMessage(i18n.addCustomExtension)}
          initialData={extensionToFormData({
            ...deepLinkModalConfig,
            enabled: true,
          } as FixedExtensionEntry)}
          onClose={handleModalClose}
          onSubmit={handleAddExtension}
          submitLabel={intl.formatMessage(i18n.addExtension)}
          modalType={'add'}
        />
      )}

      <BaseModal
        isOpen={isAddMarketplaceOpen}
        title={intl.formatMessage(i18n.addMarketplaceTitle)}
        actions={
          <div className="flex justify-end gap-2 px-8">
            <Button
              variant="ghost"
              onClick={() => {
                setIsAddMarketplaceOpen(false);
                setMarketplaceSource('');
              }}
            >
              {intl.formatMessage(i18n.cancel)}
            </Button>
            <Button onClick={handleAddMarketplace} disabled={!marketplaceSource.trim()}>
              {intl.formatMessage(i18n.addMarketplace)}
            </Button>
          </div>
        }
      >
        <Input
          autoFocus
          value={marketplaceSource}
          onChange={(e) => setMarketplaceSource(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddMarketplace();
          }}
          placeholder={intl.formatMessage(i18n.marketplaceSourcePlaceholder)}
        />
      </BaseModal>
    </div>
  );
}

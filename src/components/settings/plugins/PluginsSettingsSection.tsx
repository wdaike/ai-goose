import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import kebabCase from 'lodash/kebabCase';
import { AlertCircle, Blocks, Plus, Search, Zap } from 'lucide-react';
import type { ExtensionConfig } from '../../../types/extensions';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import { Skeleton } from '../../ui/skeleton';
import { Gear } from '../../icons';
import { useConfig, FixedExtensionEntry } from '../../ConfigContext';
import { errorMessage } from '../../../utils/conversionUtils';
import { getInitialWorkingDir } from '../../../utils/workingDir';
import { listManagedSkills, setSkillEnabled } from '../../../codex/engine/skillPolicy';
import type { SkillMetadata } from '../../../codex/protocol/v2/SkillMetadata';
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
    defaultMessage: 'Manage MCP extensions and skills',
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
});

type PluginsTab = 'mcps' | 'skills';

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
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  description: string | null;
  scope: string;
  actions: ReactNode;
}) {
  return (
    <div
      id={id}
      className="group flex items-center gap-4 py-4 px-3 -mx-3 rounded-xl transition-colors hover:bg-background-secondary"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-text-secondary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base text-text-primary truncate">{title}</div>
        {description && (
          <div className="text-sm text-text-secondary truncate mt-0.5">{description}</div>
        )}
      </div>
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
}: {
  skill: SkillMetadata;
  onToggle: (skill: SkillMetadata, enabled: boolean) => Promise<void>;
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
        <Switch
          checked={visuallyEnabled}
          onCheckedChange={handleToggle}
          disabled={isToggling}
          variant="mono"
          aria-label={intl.formatMessage(i18n.toggleItem, { name: skill.name })}
        />
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
  }, [loadSkills]);

  const extensions = useMemo(
    () => [...extensionsList].sort((a, b) => getFriendlyTitle(a).localeCompare(getFriendlyTitle(b))),
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
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query)
    );
  }, [skills, query]);

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
          <SkillRow key={skill.path} skill={skill} onToggle={handleSkillToggle} />
        ))}
      </div>
    );
  };

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
              placeholder={intl.formatMessage(
                activeTab === 'mcps' ? i18n.searchMcps : i18n.searchSkills
              )}
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
        </div>
      </div>

      {activeTab === 'mcps' ? renderMcps() : renderSkills()}

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
    </div>
  );
}

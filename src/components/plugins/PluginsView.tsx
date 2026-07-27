import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Download,
  ListFilter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import { BaseModal } from '../ui/BaseModal';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { PluginLogo, SkillLogo, pluginTitle } from './logos';
import PluginDetails from './PluginDetails';
import { errorMessage } from '../../utils/conversionUtils';
import { getInitialWorkingDir } from '../../utils/workingDir';
import { listManagedSkills, setSkillEnabled } from '../../codex/engine/skillPolicy';
import {
  addMarketplace,
  installPlugin,
  listPlugins,
  setPluginEnabled,
  uninstallPlugin,
} from '../../codex/engine/pluginCatalog';
import type { SkillMetadata } from '../../codex/protocol/v2/SkillMetadata';
import type { PluginSummary } from '../../codex/protocol/v2/PluginSummary';
import type { PluginMarketplaceEntry } from '../../codex/protocol/v2/PluginMarketplaceEntry';
import { defineMessages, useIntl } from '../../i18n';
import { cn } from '../../utils';

const i18n = defineMessages({
  tabPlugins: {
    id: 'pluginsView.tabPlugins',
    defaultMessage: 'Plugins',
  },
  tabSkills: {
    id: 'pluginsView.tabSkills',
    defaultMessage: 'Skills',
  },
  pluginsSubtitle: {
    id: 'pluginsView.pluginsSubtitle',
    defaultMessage: 'Work with iCodex across your favorite tools',
  },
  skillsSubtitle: {
    id: 'pluginsView.skillsSubtitle',
    defaultMessage: 'Reusable instructions iCodex loads when a task needs them',
  },
  searchPlugins: {
    id: 'pluginsView.searchPlugins',
    defaultMessage: 'Search plugins',
  },
  searchSkills: {
    id: 'pluginsView.searchSkills',
    defaultMessage: 'Search skills',
  },
  installed: {
    id: 'pluginsView.installed',
    defaultMessage: 'Installed',
  },
  featured: {
    id: 'pluginsView.featured',
    defaultMessage: 'Featured',
  },
  filter: {
    id: 'pluginsView.filter',
    defaultMessage: 'Filter by category',
  },
  allCategories: {
    id: 'pluginsView.allCategories',
    defaultMessage: 'All categories',
  },
  refresh: {
    id: 'pluginsView.refresh',
    defaultMessage: 'Refresh',
  },
  manage: {
    id: 'pluginsView.manage',
    defaultMessage: 'Manage in settings',
  },
  addMarketplace: {
    id: 'pluginsView.addMarketplace',
    defaultMessage: 'Add marketplace',
  },
  marketplaceSourcePlaceholder: {
    id: 'pluginsView.marketplaceSourcePlaceholder',
    defaultMessage: 'git URL or local path',
  },
  cancel: {
    id: 'pluginsView.cancel',
    defaultMessage: 'Cancel',
  },
  install: {
    id: 'pluginsView.install',
    defaultMessage: 'Install',
  },
  enable: {
    id: 'pluginsView.enable',
    defaultMessage: 'Enable',
  },
  disable: {
    id: 'pluginsView.disable',
    defaultMessage: 'Disable',
  },
  uninstall: {
    id: 'pluginsView.uninstall',
    defaultMessage: 'Uninstall',
  },
  moreActions: {
    id: 'pluginsView.moreActions',
    defaultMessage: 'More actions for {name}',
  },
  toggleItem: {
    id: 'pluginsView.toggleItem',
    defaultMessage: 'Toggle {name} on or off',
  },
  disabledByAdmin: {
    id: 'pluginsView.disabledByAdmin',
    defaultMessage: 'Disabled by admin',
  },
  disabled: {
    id: 'pluginsView.disabled',
    defaultMessage: 'Disabled',
  },
  seeMore: {
    id: 'pluginsView.seeMore',
    defaultMessage: 'See {count, plural, one {# more plugin} other {# more plugins}}',
  },
  seeLess: {
    id: 'pluginsView.seeLess',
    defaultMessage: 'Show fewer plugins',
  },
  noPlugins: {
    id: 'pluginsView.noPlugins',
    defaultMessage: 'No plugins available',
  },
  noPluginsDescription: {
    id: 'pluginsView.noPluginsDescription',
    defaultMessage: 'Add a marketplace to browse and install plugins.',
  },
  noSkills: {
    id: 'pluginsView.noSkills',
    defaultMessage: 'No skills installed',
  },
  noSkillsDescription: {
    id: 'pluginsView.noSkillsDescription',
    defaultMessage: 'Skills are loaded from SKILL.md files in the iCodex skills directory.',
  },
  noMatches: {
    id: 'pluginsView.noMatches',
    defaultMessage: 'No results for "{query}"',
  },
  errorLoading: {
    id: 'pluginsView.errorLoading',
    defaultMessage: 'Something went wrong',
  },
  tryAgain: {
    id: 'pluginsView.tryAgain',
    defaultMessage: 'Try Again',
  },
  scopeProject: {
    id: 'pluginsView.scopeProject',
    defaultMessage: 'Project',
  },
  scopeSystem: {
    id: 'pluginsView.scopeSystem',
    defaultMessage: 'System',
  },
  scopePersonal: {
    id: 'pluginsView.scopePersonal',
    defaultMessage: 'Personal',
  },
});

const FEATURED_LIMIT = 8;

type PluginsViewTab = 'plugins' | 'skills';

interface PluginRow {
  market: PluginMarketplaceEntry;
  plugin: PluginSummary;
}

const marketTitle = (market: PluginMarketplaceEntry) =>
  market.interface?.displayName || market.name;

function InstalledTile({
  plugin,
  onToggle,
}: {
  plugin: PluginSummary;
  onToggle: (plugin: PluginSummary, enabled: boolean) => Promise<void>;
}) {
  const intl = useIntl();
  const title = pluginTitle(plugin);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onToggle(plugin, !plugin.enabled)}
          aria-label={intl.formatMessage(i18n.toggleItem, { name: title })}
          className={cn(
            'rounded-2xl p-0.5 transition-opacity hover:opacity-80',
            !plugin.enabled && 'opacity-35'
          )}
        >
          <PluginLogo plugin={plugin} className="h-12 w-12 rounded-2xl text-lg" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {title}
        {!plugin.enabled && ` · ${intl.formatMessage(i18n.disabled)}`}
      </TooltipContent>
    </Tooltip>
  );
}

function PluginCard({
  row,
  onToggle,
  onInstall,
  onUninstall,
  onOpen,
}: {
  row: PluginRow;
  onToggle: (plugin: PluginSummary, enabled: boolean) => Promise<void>;
  onInstall: (row: PluginRow) => Promise<void>;
  onUninstall: (plugin: PluginSummary) => Promise<void>;
  onOpen: (row: PluginRow) => void;
}) {
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  const { plugin } = row;
  const title = pluginTitle(plugin);
  const description = plugin.interface?.shortDescription ?? plugin.interface?.category ?? null;
  const disabledByAdmin = plugin.availability === 'DISABLED_BY_ADMIN';

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-background-secondary',
        plugin.installed && !plugin.enabled && 'opacity-50'
      )}
    >
      <button onClick={() => onOpen(row)} className="flex min-w-0 flex-1 items-center gap-3">
        <PluginLogo plugin={plugin} className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-[15px] text-text-primary">{title}</div>
          {description && <div className="truncate text-sm text-text-secondary">{description}</div>}
        </div>
      </button>
      {disabledByAdmin ? (
        <span className="shrink-0 text-sm text-text-tertiary">
          {intl.formatMessage(i18n.disabledByAdmin)}
        </span>
      ) : plugin.installed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={busy}
              aria-label={intl.formatMessage(i18n.moreActions, { name: title })}
              className="shrink-0 rounded-lg p-1.5 text-text-secondary opacity-0 transition-opacity hover:bg-background-tertiary hover:text-text-primary group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            <DropdownMenuItem onSelect={() => run(() => onToggle(plugin, !plugin.enabled))}>
              {intl.formatMessage(plugin.enabled ? i18n.disable : i18n.enable)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => run(() => onUninstall(plugin))}>
              <Trash2 className="h-4 w-4" />
              {intl.formatMessage(i18n.uninstall)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          variant="secondary"
          className="h-8 shrink-0 gap-1.5 rounded-full"
          disabled={busy}
          onClick={() => run(() => onInstall(row))}
        >
          <Download className="h-4 w-4" />
          {intl.formatMessage(i18n.install)}
        </Button>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  onToggle,
}: {
  skill: SkillMetadata;
  onToggle: (skill: SkillMetadata, enabled: boolean) => Promise<void>;
}) {
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  const title = skill.interface?.displayName || skill.name;
  const scope =
    skill.scope === 'repo'
      ? i18n.scopeProject
      : skill.scope === 'system' || skill.scope === 'admin'
        ? i18n.scopeSystem
        : i18n.scopePersonal;

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle(skill, !skill.enabled);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-background-secondary">
      <SkillLogo skill={skill} className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] text-text-primary">{title}</div>
        <div className="truncate text-sm text-text-secondary">
          {skill.interface?.shortDescription || skill.description}
        </div>
      </div>
      <span className="shrink-0 text-sm text-text-tertiary">{intl.formatMessage(scope)}</span>
      <Switch
        checked={skill.enabled}
        onCheckedChange={handleToggle}
        disabled={busy}
        variant="mono"
        aria-label={intl.formatMessage(i18n.toggleItem, { name: title })}
      />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="min-w-0 flex-1">
        <Skeleton className="mb-2 h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export default function PluginsView() {
  const intl = useIntl();
  const navigate = useNavigate();

  const [tab, setTab] = useState<PluginsViewTab>('plugins');
  const [search, setSearch] = useState('');
  const [selectedMarket, setSelectedMarket] = useState('');
  const [category, setCategory] = useState('');
  const [expanded, setExpanded] = useState(false);

  const [markets, setMarkets] = useState<PluginMarketplaceEntry[]>([]);
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAddMarketplaceOpen, setIsAddMarketplaceOpen] = useState(false);
  const [marketplaceSource, setMarketplaceSource] = useState('');
  const [selected, setSelected] = useState<PluginRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cwd = getInitialWorkingDir();
    try {
      const [listing, managedSkills] = await Promise.all([
        listPlugins(cwd),
        listManagedSkills(cwd),
      ]);
      setMarkets(listing.marketplaces);
      setSkills(managedSkills);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load plugins'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo<PluginRow[]>(
    () => markets.flatMap((market) => market.plugins.map((plugin) => ({ market, plugin }))),
    [markets]
  );

  const installed = useMemo(() => rows.filter(({ plugin }) => plugin.installed), [rows]);

  const activeMarket = markets.some((market) => market.name === selectedMarket)
    ? selectedMarket
    : (markets[0]?.name ?? '');

  const categories = useMemo(() => {
    const found = new Set<string>();
    for (const { market, plugin } of rows) {
      if (market.name === activeMarket && plugin.interface?.category) {
        found.add(plugin.interface.category);
      }
    }
    return [...found].sort();
  }, [rows, activeMarket]);

  const query = search.trim().toLowerCase();

  const visiblePlugins = useMemo(() => {
    const matches = rows.filter(({ market, plugin }) => {
      if (market.name !== activeMarket) return false;
      if (category && (plugin.interface?.category ?? '') !== category) return false;
      if (!query) return true;
      return [pluginTitle(plugin), plugin.name, plugin.interface?.shortDescription].some((text) =>
        text?.toLowerCase().includes(query)
      );
    });
    return matches.sort(
      (a, b) =>
        Number(b.plugin.installed) - Number(a.plugin.installed) ||
        pluginTitle(a.plugin).localeCompare(pluginTitle(b.plugin))
    );
  }, [rows, activeMarket, category, query]);

  const shownPlugins = expanded ? visiblePlugins : visiblePlugins.slice(0, FEATURED_LIMIT);
  const hiddenPlugins = visiblePlugins.slice(shownPlugins.length);

  const visibleSkills = useMemo(() => {
    if (!query) return skills;
    return skills.filter((skill) =>
      [skill.interface?.displayName, skill.name, skill.description].some((text) =>
        text?.toLowerCase().includes(query)
      )
    );
  }, [skills, query]);

  const handlePluginToggle = async (plugin: PluginSummary, enabled: boolean) => {
    await setPluginEnabled(plugin.id, enabled);
    setMarkets((prev) =>
      prev.map((market) => ({
        ...market,
        plugins: market.plugins.map((p) => (p.id === plugin.id ? { ...p, enabled } : p)),
      }))
    );
  };

  const handleInstall = async ({ market, plugin }: PluginRow) => {
    await installPlugin(market, plugin.name);
    await load();
  };

  const handleUninstall = async (plugin: PluginSummary) => {
    await uninstallPlugin(plugin.id);
    await load();
  };

  const handleSkillToggle = async (skill: SkillMetadata, enabled: boolean) => {
    await setSkillEnabled(skill.path, enabled);
    setSkills((prev) => prev.map((s) => (s.path === skill.path ? { ...s, enabled } : s)));
  };

  const handleAddMarketplace = async () => {
    const source = marketplaceSource.trim();
    if (!source) return;
    setIsAddMarketplaceOpen(false);
    setMarketplaceSource('');
    try {
      await addMarketplace(source);
    } catch (err) {
      setError(errorMessage(err, 'Failed to add marketplace'));
    } finally {
      await load();
    }
  };

  const renderEmpty = (title: string, description: string) => (
    <div className="py-16 text-center text-text-secondary">
      <p className="mb-1">{title}</p>
      <p className="text-sm">{description}</p>
    </div>
  );

  const renderPlugins = () => {
    if (rows.length === 0) {
      return renderEmpty(
        intl.formatMessage(i18n.noPlugins),
        intl.formatMessage(i18n.noPluginsDescription)
      );
    }

    return (
      <>
        {installed.length > 0 && (
          <section className="mb-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg text-text-primary">{intl.formatMessage(i18n.installed)}</h2>
              <button
                onClick={() => navigate('/settings?section=plugins')}
                aria-label={intl.formatMessage(i18n.manage)}
                title={intl.formatMessage(i18n.manage)}
                className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-border-primary pt-4">
              {installed.map(({ plugin }) => (
                <InstalledTile key={plugin.id} plugin={plugin} onToggle={handlePluginToggle} />
              ))}
            </div>
          </section>
        )}

        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            {markets.map((market) => (
              <button
                key={market.name}
                onClick={() => {
                  setSelectedMarket(market.name);
                  setCategory('');
                  setExpanded(false);
                }}
                aria-current={market.name === activeMarket ? 'true' : undefined}
                className={cn(
                  'h-9 rounded-full px-4 text-sm transition-colors',
                  market.name === activeMarket
                    ? 'bg-background-tertiary text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {marketTitle(market)}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={intl.formatMessage(i18n.filter)}
                title={intl.formatMessage(i18n.filter)}
                className={cn(
                  'rounded-lg p-1.5 transition-colors hover:bg-background-tertiary hover:text-text-primary',
                  category ? 'text-text-primary' : 'text-text-secondary'
                )}
              >
                <ListFilter className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuRadioGroup value={category} onValueChange={setCategory}>
                <DropdownMenuRadioItem value="">
                  {intl.formatMessage(i18n.allCategories)}
                </DropdownMenuRadioItem>
                {categories.map((name) => (
                  <DropdownMenuRadioItem key={name} value={name}>
                    {name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h2 className="border-t border-border-primary pb-2 pt-6 text-lg text-text-primary">
          {intl.formatMessage(i18n.featured)}
        </h2>

        {visiblePlugins.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-secondary">
            {query
              ? intl.formatMessage(i18n.noMatches, { query: search.trim() })
              : intl.formatMessage(i18n.noPlugins)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {shownPlugins.map((row) => (
              <PluginCard
                key={row.plugin.id}
                row={row}
                onToggle={handlePluginToggle}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onOpen={setSelected}
              />
            ))}
          </div>
        )}

        {(hiddenPlugins.length > 0 || expanded) && (
          <button
            onClick={() => setExpanded((value) => !value)}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-background-secondary"
          >
            <span className="flex shrink-0 -space-x-2">
              {(expanded ? shownPlugins.slice(-3) : hiddenPlugins.slice(0, 3)).map(({ plugin }) => (
                <PluginLogo
                  key={plugin.id}
                  plugin={plugin}
                  className="h-7 w-7 rounded-lg ring-2 ring-background-primary"
                />
              ))}
            </span>
            <span className="truncate text-[15px] text-text-secondary">
              {expanded
                ? intl.formatMessage(i18n.seeLess)
                : intl.formatMessage(i18n.seeMore, { count: hiddenPlugins.length })}
            </span>
          </button>
        )}
      </>
    );
  };

  const renderSkills = () => {
    if (skills.length === 0) {
      return renderEmpty(
        intl.formatMessage(i18n.noSkills),
        intl.formatMessage(i18n.noSkillsDescription)
      );
    }
    if (visibleSkills.length === 0) {
      return (
        <div className="py-12 text-center text-sm text-text-secondary">
          {intl.formatMessage(i18n.noMatches, { query: search.trim() })}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-x-6 border-t border-border-primary pt-4 sm:grid-cols-2">
        {visibleSkills.map((skill) => (
          <SkillCard key={skill.path} skill={skill} onToggle={handleSkillToggle} />
        ))}
      </div>
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <AlertCircle className="mb-3 h-10 w-10 text-text-danger" />
          <p className="mb-1">{intl.formatMessage(i18n.errorLoading)}</p>
          <p className="mb-4 text-sm">{error}</p>
          <Button onClick={load}>{intl.formatMessage(i18n.tryAgain)}</Button>
        </div>
      );
    }
    return tab === 'plugins' ? renderPlugins() : renderSkills();
  };

  return (
    <div className="flex h-full flex-col bg-background-primary">
      {/* Drag region clearing the window controls. */}
      <div className="h-[52px] shrink-0" />

      <div className="flex shrink-0 items-center gap-1 px-6 pb-3">
        {(['plugins', 'skills'] as PluginsViewTab[]).map((value) => (
          <button
            key={value}
            onClick={() => {
              setTab(value);
              setSelected(null);
            }}
            data-testid={`plugins-view-tab-${value}`}
            aria-current={tab === value ? 'page' : undefined}
            className={cn(
              'no-drag h-9 rounded-full px-4 text-sm transition-colors',
              tab === value
                ? 'bg-background-tertiary text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {intl.formatMessage(value === 'plugins' ? i18n.tabPlugins : i18n.tabSkills)}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={load}
          disabled={loading}
          aria-label={intl.formatMessage(i18n.refresh)}
          title={intl.formatMessage(i18n.refresh)}
          className="no-drag rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
        <button
          onClick={() => navigate('/settings?section=plugins')}
          aria-label={intl.formatMessage(i18n.manage)}
          title={intl.formatMessage(i18n.manage)}
          className="no-drag rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary"
        >
          <Settings className="h-4 w-4" />
        </button>
        {tab === 'plugins' && (
          <Button
            className="no-drag ml-1 h-9 gap-1.5 rounded-full"
            onClick={() => setIsAddMarketplaceOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {intl.formatMessage(i18n.addMarketplace)}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-[880px] px-8 pb-20 pt-6">
          {selected ? (
            <PluginDetails
              market={selected.market}
              plugin={selected.plugin}
              breadcrumb={intl.formatMessage(i18n.tabPlugins)}
              onBack={() => setSelected(null)}
              onChanged={load}
            />
          ) : (
            <>
              <h1 className="mb-2 text-[40px] font-medium leading-tight text-text-primary">
                {intl.formatMessage(tab === 'plugins' ? i18n.tabPlugins : i18n.tabSkills)}
              </h1>
              <p className="mb-8 text-lg text-text-secondary">
                {intl.formatMessage(tab === 'plugins' ? i18n.pluginsSubtitle : i18n.skillsSubtitle)}
              </p>

              <div className="relative mb-10">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={intl.formatMessage(
                    tab === 'plugins' ? i18n.searchPlugins : i18n.searchSkills
                  )}
                  data-testid="plugins-view-search"
                  className="h-12 w-full rounded-full border border-border-primary bg-background-primary pl-11 pr-4 text-[15px] text-text-primary transition-colors placeholder:text-text-tertiary focus:border-border-secondary focus-visible:outline-none"
                />
              </div>

              {renderBody()}
            </>
          )}
        </div>
      </ScrollArea>

      <BaseModal
        isOpen={isAddMarketplaceOpen}
        title={intl.formatMessage(i18n.addMarketplace)}
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
          onChange={(event) => setMarketplaceSource(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleAddMarketplace();
          }}
          placeholder={intl.formatMessage(i18n.marketplaceSourcePlaceholder)}
        />
      </BaseModal>
    </div>
  );
}

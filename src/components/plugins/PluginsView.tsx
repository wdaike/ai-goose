import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Blocks,
  ChevronDown,
  CircleDot,
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
import { PluginLogo, pluginTitle } from './logos';
import PluginDetails from './PluginDetails';
import { errorMessage } from '../../utils/conversionUtils';
import { getInitialWorkingDir } from '../../utils/workingDir';
import {
  addMarketplace,
  installPlugin,
  listPlugins,
  setPluginEnabled,
  uninstallPlugin,
} from '../../codex/engine/pluginCatalog';
import type { PluginSummary } from '../../codex/protocol/v2/PluginSummary';
import type { PluginMarketplaceEntry } from '../../codex/protocol/v2/PluginMarketplaceEntry';
import { defineMessages, useIntl } from '../../i18n';
import { cn } from '../../utils';

const i18n = defineMessages({
  tabPlugins: {
    id: 'pluginsView.tabPlugins',
    defaultMessage: 'Plugins',
  },
  pluginsSubtitle: {
    id: 'pluginsView.pluginsSubtitle',
    defaultMessage: 'Work with iCodex across your favorite tools',
  },
  searchPlugins: {
    id: 'pluginsView.searchPlugins',
    defaultMessage: 'Search plugins',
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
  create: {
    id: 'pluginsView.create',
    defaultMessage: 'Create',
  },
  createMenu: {
    id: 'pluginsView.createMenu',
    defaultMessage: 'Create menu',
  },
  createPlugin: {
    id: 'pluginsView.createPlugin',
    defaultMessage: 'Create plugin',
  },
  addMarketplace: {
    id: 'pluginsView.addMarketplace',
    defaultMessage: 'Add marketplace',
  },
  recordSkill: {
    id: 'pluginsView.recordSkill',
    defaultMessage: 'Record a skill',
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
  noPlugins: {
    id: 'pluginsView.noPlugins',
    defaultMessage: 'No plugins available',
  },
  noPluginsDescription: {
    id: 'pluginsView.noPluginsDescription',
    defaultMessage: 'Add a marketplace to browse and install plugins.',
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
});

const FEATURED_LIMIT = 8;
const OTHER_CATEGORY = 'Other';
/** Filter value for the featured shelf, kept apart from real category names. */
const FEATURED_FILTER = '__featured__';
const FEATURED_COUNT = 12;
/** The catalog carries no featured flag, so these are the picks we lead the shelf with. */
const FEATURED_PICKS = [
  'github',
  'gmail',
  'slack',
  'google-drive',
  'notion',
  'outlook-email',
  'linear',
  'figma',
  'google-calendar',
  'canva',
  'stripe',
  'vercel',
];

interface PluginRow {
  market: PluginMarketplaceEntry;
  plugin: PluginSummary;
}

const rowCategory = (plugin: PluginSummary) => plugin.interface?.category || OTHER_CATEGORY;

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

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const [markets, setMarkets] = useState<PluginMarketplaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAddMarketplaceOpen, setIsAddMarketplaceOpen] = useState(false);
  const [marketplaceSource, setMarketplaceSource] = useState('');

  /** The opened plugin lives in the URL so back/forward walk in and out of it. */
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('plugin');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listing = await listPlugins(getInitialWorkingDir());
      setMarkets(listing.marketplaces);
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

  const selected = useMemo(
    () => rows.find(({ plugin }) => plugin.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const query = search.trim().toLowerCase();

  const matched = useMemo(() => {
    if (!query) return rows;
    return rows.filter(({ plugin }) =>
      [pluginTitle(plugin), plugin.name, plugin.interface?.shortDescription].some((text) =>
        text?.toLowerCase().includes(query)
      )
    );
  }, [rows, query]);

  const visiblePlugins = useMemo(() => {
    const inCategory =
      category && category !== FEATURED_FILTER
        ? matched.filter(({ plugin }) => rowCategory(plugin) === category)
        : matched;
    return [...inCategory].sort(
      (a, b) =>
        Number(b.plugin.installed) - Number(a.plugin.installed) ||
        pluginTitle(a.plugin).localeCompare(pluginTitle(b.plugin))
    );
  }, [matched, category]);

  /** Installed apps lead, then the picks below, then whatever the catalog lists first. */
  const featuredPlugins = useMemo(() => {
    const rank = ({ plugin }: PluginRow) => {
      if (plugin.installed) return -1;
      const pick = FEATURED_PICKS.indexOf(plugin.name);
      return pick === -1 ? FEATURED_PICKS.length : pick;
    };
    return matched
      .map((row, index) => ({ row, index }))
      .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
      .slice(0, FEATURED_COUNT)
      .map(({ row }) => row);
  }, [matched]);

  const categoryLabel = (value: string) => {
    if (value === FEATURED_FILTER) return intl.formatMessage(i18n.featured);
    return value || intl.formatMessage(i18n.allCategories);
  };

  /** Categories ordered by how much they hold, so the richest shelves come first. */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { plugin } of rows) {
      const name = rowCategory(plugin);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const rank = (name: string) => (name === OTHER_CATEGORY ? 1 : 0);
    return [...counts.entries()]
      .sort(
        ([aName, aCount], [bName, bCount]) =>
          rank(aName) - rank(bName) || bCount - aCount || aName.localeCompare(bName)
      )
      .map(([name]) => name);
  }, [rows]);

  /** `All` browses shelf by shelf; picking a filter drills into just that shelf. */
  const shelves = useMemo(() => {
    const featured = {
      name: intl.formatMessage(i18n.featured),
      rows: featuredPlugins,
      hidden: 0,
      preview: [] as PluginRow[],
    };
    if (category === FEATURED_FILTER) return featured.rows.length > 0 ? [featured] : [];
    if (category)
      return visiblePlugins.length > 0
        ? [{ name: category, rows: visiblePlugins, hidden: 0, preview: [] as PluginRow[] }]
        : [];

    const byCategory = categories
      .map((name) => {
        const matches = visiblePlugins.filter(({ plugin }) => rowCategory(plugin) === name);
        return {
          name,
          rows: matches.slice(0, FEATURED_LIMIT),
          hidden: Math.max(matches.length - FEATURED_LIMIT, 0),
          preview: matches.slice(FEATURED_LIMIT, FEATURED_LIMIT + 3),
        };
      })
      .filter((shelf) => shelf.rows.length > 0);
    return featured.rows.length > 0 ? [featured, ...byCategory] : byCategory;
  }, [categories, category, featuredPlugins, intl, visiblePlugins]);

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

  const startCreator = (prompt: string) =>
    navigate('/pair', {
      state: { initialMessage: { msg: prompt, images: [] }, noAutoSubmit: true },
    });

  const createPlugin = () => startCreator('/plugin-creator Create a new plugin');
  const recordSkill = () => startCreator('/skill-creator Help me create a new skill');

  const renderPlugins = () => {
    if (rows.length === 0) {
      return (
        <div className="py-16 text-center text-text-secondary">
          <p className="mb-1">{intl.formatMessage(i18n.noPlugins)}</p>
          <p className="text-sm">{intl.formatMessage(i18n.noPluginsDescription)}</p>
        </div>
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

        <>
          <div className="mb-6 flex items-center justify-between gap-4">
            <button
              onClick={() => setCategory('')}
              aria-current="true"
              className="h-9 rounded-full bg-background-tertiary px-4 text-sm text-text-primary"
            >
              {categoryLabel(category)}
            </button>
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
                  <DropdownMenuRadioItem value="">{categoryLabel('')}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={FEATURED_FILTER}>
                    {categoryLabel(FEATURED_FILTER)}
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

          {shelves.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-secondary">
              {query
                ? intl.formatMessage(i18n.noMatches, { query: search.trim() })
                : intl.formatMessage(i18n.noPlugins)}
            </div>
          ) : (
            shelves.map((shelf) => (
              <section key={shelf.name} className="mb-2">
                <h2 className="border-t border-border-primary pb-2 pt-6 text-lg text-text-primary">
                  {shelf.name}
                </h2>
                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  {shelf.rows.map((row) => (
                    <PluginCard
                      key={row.plugin.id}
                      row={row}
                      onToggle={handlePluginToggle}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      onOpen={(row) => setSearchParams({ plugin: row.plugin.id })}
                    />
                  ))}
                </div>
                {shelf.hidden > 0 && (
                  <button
                    onClick={() => setCategory(shelf.name)}
                    className="mt-4 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-background-secondary"
                  >
                    <span className="flex shrink-0 -space-x-2">
                      {shelf.preview.map(({ plugin }) => (
                        <PluginLogo
                          key={plugin.id}
                          plugin={plugin}
                          className="h-7 w-7 rounded-lg ring-2 ring-background-primary"
                        />
                      ))}
                    </span>
                    <span className="truncate text-[15px] text-text-secondary">
                      {intl.formatMessage(i18n.seeMore, { count: shelf.hidden })}
                    </span>
                  </button>
                )}
              </section>
            ))
          )}
        </>
      </>
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
    return renderPlugins();
  };

  return (
    <div className="flex h-full flex-col bg-background-primary">
      {/* Drag region clearing the window controls. */}
      <div className="h-[52px] shrink-0" />

      <div className="flex shrink-0 items-center gap-1 px-6 pb-3">
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
        <div className="no-drag ml-1 flex">
          <Button className="h-9 rounded-r-none pr-3" onClick={createPlugin}>
            {intl.formatMessage(i18n.create)}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={intl.formatMessage(i18n.createMenu)}
                className="flex h-9 items-center rounded-r-full border-l border-white/20 bg-background-inverse px-2 text-text-inverse transition-colors hover:bg-background-inverse/90"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[13rem]">
              <DropdownMenuItem onSelect={createPlugin}>
                <Blocks className="h-4 w-4" />
                {intl.formatMessage(i18n.createPlugin)}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsAddMarketplaceOpen(true)}>
                <Plus className="h-4 w-4" />
                {intl.formatMessage(i18n.addMarketplace)}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={recordSkill}>
                <CircleDot className="h-4 w-4" />
                {intl.formatMessage(i18n.recordSkill)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-[880px] px-8 pb-20 pt-6">
          {selected ? (
            <PluginDetails
              market={selected.market}
              plugin={selected.plugin}
              breadcrumb={intl.formatMessage(i18n.tabPlugins)}
              onBack={() => setSearchParams({})}
              onChanged={load}
            />
          ) : (
            <>
              <h1 className="mb-2 text-[40px] font-medium leading-tight text-text-primary">
                {intl.formatMessage(i18n.tabPlugins)}
              </h1>
              <p className="mb-8 text-lg text-text-secondary">
                {intl.formatMessage(i18n.pluginsSubtitle)}
              </p>

              <div className="relative mb-10">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={intl.formatMessage(i18n.searchPlugins)}
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

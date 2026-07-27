import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Box, ChevronRight, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { PluginLogo, SkillLogo, pluginTitle } from './logos';
import SkillDetailsModal from './SkillDetailsModal';
import { setSkillEnabled } from '../../codex/engine/skillPolicy';
import { readPlugin, setPluginEnabled, uninstallPlugin } from '../../codex/engine/pluginCatalog';
import type { PluginDetail } from '../../codex/protocol/v2/PluginDetail';
import type { PluginMarketplaceEntry } from '../../codex/protocol/v2/PluginMarketplaceEntry';
import type { PluginSummary } from '../../codex/protocol/v2/PluginSummary';
import type { SkillSummary } from '../../codex/protocol/v2/SkillSummary';
import { errorMessage } from '../../utils/conversionUtils';
import { getInitialWorkingDir } from '../../utils/workingDir';
import { defineMessages, useIntl } from '../../i18n';
import { cn } from '../../utils';

const i18n = defineMessages({
  tryNow: {
    id: 'pluginDetails.tryNow',
    defaultMessage: 'Try now',
  },
  tryNowPrompt: {
    id: 'pluginDetails.tryNowPrompt',
    defaultMessage: 'Use the {name} plugin to ',
  },
  moreActions: {
    id: 'pluginDetails.moreActions',
    defaultMessage: 'More actions for {name}',
  },
  enable: {
    id: 'pluginDetails.enable',
    defaultMessage: 'Enable',
  },
  disable: {
    id: 'pluginDetails.disable',
    defaultMessage: 'Disable',
  },
  uninstall: {
    id: 'pluginDetails.uninstall',
    defaultMessage: 'Uninstall',
  },
  toggleItem: {
    id: 'pluginDetails.toggleItem',
    defaultMessage: 'Toggle {name} on or off',
  },
  skills: {
    id: 'pluginDetails.skills',
    defaultMessage: 'Skills',
  },
  mcpServers: {
    id: 'pluginDetails.mcpServers',
    defaultMessage: 'MCPs',
  },
  apps: {
    id: 'pluginDetails.apps',
    defaultMessage: 'Apps',
  },
  hooks: {
    id: 'pluginDetails.hooks',
    defaultMessage: 'Hooks',
  },
  information: {
    id: 'pluginDetails.information',
    defaultMessage: 'Information',
  },
  capabilities: {
    id: 'pluginDetails.capabilities',
    defaultMessage: 'Capabilities',
  },
  developer: {
    id: 'pluginDetails.developer',
    defaultMessage: 'Developer',
  },
  category: {
    id: 'pluginDetails.category',
    defaultMessage: 'Category',
  },
  version: {
    id: 'pluginDetails.version',
    defaultMessage: 'Version',
  },
  marketplace: {
    id: 'pluginDetails.marketplace',
    defaultMessage: 'Marketplace',
  },
  website: {
    id: 'pluginDetails.website',
    defaultMessage: 'Website',
  },
  privacyPolicy: {
    id: 'pluginDetails.privacyPolicy',
    defaultMessage: 'Privacy policy',
  },
  termsOfService: {
    id: 'pluginDetails.termsOfService',
    defaultMessage: 'Terms of service',
  },
  errorLoading: {
    id: 'pluginDetails.errorLoading',
    defaultMessage: 'Could not load plugin details',
  },
  tryAgain: {
    id: 'pluginDetails.tryAgain',
    defaultMessage: 'Try Again',
  },
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The hero fades the plugin's brand colour; anything else would fight the theme. */
function heroBackground(brandColor: string | null | undefined): string | undefined {
  if (!brandColor || !HEX_COLOR.test(brandColor)) return undefined;
  return `linear-gradient(135deg, ${brandColor}2e, ${brandColor}0d)`;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-1 flex items-baseline gap-2 border-b border-border-primary pb-3 text-lg text-text-primary">
        {title}
        {count !== undefined && <span className="text-base text-text-tertiary">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-6 py-3">
      <div className="w-40 shrink-0 text-sm text-text-secondary">{label}</div>
      <div className="min-w-0 flex-1 text-sm text-text-primary">{children}</div>
    </div>
  );
}

function SkillRow({
  skill,
  onToggle,
  onOpen,
}: {
  skill: SkillSummary;
  onToggle: (skill: SkillSummary, enabled: boolean) => Promise<void>;
  onOpen: (skill: SkillSummary) => void;
}) {
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  const title = skill.interface?.displayName || skill.name;

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
    <div className="flex items-center gap-4 py-4">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
        disabled={!skill.path}
        onClick={() => onOpen(skill)}
      >
        <SkillLogo skill={skill} className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base text-text-primary">{title}</div>
          <div className="truncate text-sm text-text-secondary">
            {skill.interface?.shortDescription || skill.shortDescription || skill.description}
          </div>
        </div>
      </button>
      <Switch
        checked={skill.enabled}
        onCheckedChange={handleToggle}
        disabled={busy || !skill.path}
        variant="mono"
        aria-label={intl.formatMessage(i18n.toggleItem, { name: title })}
      />
    </div>
  );
}

export default function PluginDetails({
  market,
  plugin,
  breadcrumb,
  onBack,
  onChanged,
}: {
  market: PluginMarketplaceEntry;
  plugin: PluginSummary;
  /** Label of the list this detail was opened from. */
  breadcrumb: string;
  onBack: () => void;
  /** Reloads the caller's list after the plugin is enabled, disabled or removed. */
  onChanged: () => Promise<void>;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PluginDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);

  const pluginName = plugin.name;

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetail(await readPlugin(market, pluginName, getInitialWorkingDir()));
    } catch (err) {
      setError(errorMessage(err, 'Failed to read plugin'));
    }
  }, [market, pluginName]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = detail?.summary ?? plugin;
  const iface = summary.interface;
  const title = pluginTitle(summary);
  const starters = iface?.defaultPrompt ?? [];
  const hero = heroBackground(iface?.brandColor);

  const startTurn = (prompt: string) =>
    navigate('/pair', {
      state: { initialMessage: { msg: prompt, images: [] }, noAutoSubmit: true },
    });

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = () =>
    run(async () => {
      await setPluginEnabled(summary.id, !summary.enabled);
      await load();
    });

  const handleUninstall = () =>
    run(async () => {
      await uninstallPlugin(summary.id);
      onBack();
    });

  const handleSkillToggle = async (skill: SkillSummary, enabled: boolean) => {
    if (!skill.path) return;
    await setSkillEnabled(skill.path, enabled);
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            skills: prev.skills.map((s) => (s.name === skill.name ? { ...s, enabled } : s)),
          }
        : prev
    );
  };

  const links = [
    { label: intl.formatMessage(i18n.website), url: iface?.websiteUrl },
    { label: intl.formatMessage(i18n.privacyPolicy), url: iface?.privacyPolicyUrl },
    { label: intl.formatMessage(i18n.termsOfService), url: iface?.termsOfServiceUrl },
  ].filter((link) => link.url);
  const selectedSkill = detail?.skills.find((skill) => skill.name === selectedSkillName) ?? null;

  return (
    <div className="pb-8">
      <nav className="mb-6 flex items-center gap-1 text-sm text-text-secondary">
        <button onClick={onBack} className="transition-colors hover:text-text-primary">
          {breadcrumb}
        </button>
        <ChevronRight className="h-4 w-4 text-text-tertiary" />
        <span className="text-text-primary">{title}</span>
      </nav>

      <div className="flex items-start gap-4">
        <PluginLogo plugin={summary} className="h-14 w-14 shrink-0 rounded-2xl text-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl text-text-primary">{title}</h1>
          {iface?.shortDescription && (
            <p className="mt-1 text-text-secondary">{iface.shortDescription}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={busy}
                aria-label={intl.formatMessage(i18n.moreActions, { name: title })}
                className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuItem onSelect={handleToggle}>
                {intl.formatMessage(summary.enabled ? i18n.disable : i18n.enable)}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={handleUninstall}>
                <Trash2 className="h-4 w-4" />
                {intl.formatMessage(i18n.uninstall)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            className="h-9 gap-1.5 rounded-full"
            onClick={() =>
              startTurn(starters[0] ?? intl.formatMessage(i18n.tryNowPrompt, { name: title }))
            }
          >
            <Box className="h-4 w-4" />
            {intl.formatMessage(i18n.tryNow)}
          </Button>
        </div>
      </div>

      {starters.length > 0 && (
        <div
          style={{ background: hero }}
          className={cn(
            'mt-6 flex flex-col items-center gap-3 rounded-3xl px-6 py-10',
            !hero && 'bg-background-secondary'
          )}
        >
          {starters.map((prompt) => (
            <button
              key={prompt}
              onClick={() => startTurn(prompt)}
              className="group flex w-full max-w-[540px] items-center gap-3 rounded-2xl bg-background-primary/85 px-4 py-3 text-left shadow-sm transition-colors hover:bg-background-primary"
            >
              <PluginLogo plugin={summary} className="h-5 w-5 shrink-0 rounded" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-text-primary">
                {prompt}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary transition-colors group-hover:text-text-primary" />
            </button>
          ))}
        </div>
      )}

      {(iface?.longDescription || detail?.description) && (
        <p className="mt-6 text-[15px] leading-relaxed text-text-secondary">
          {iface?.longDescription || detail?.description}
        </p>
      )}

      {error ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
          <AlertCircle className="mb-3 h-10 w-10 text-text-danger" />
          <p className="mb-1">{intl.formatMessage(i18n.errorLoading)}</p>
          <p className="mb-4 text-sm">{error}</p>
          <Button onClick={load}>{intl.formatMessage(i18n.tryAgain)}</Button>
        </div>
      ) : !detail ? (
        <div className="mt-10 space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <>
          {detail.skills.length > 0 && (
            <Section title={intl.formatMessage(i18n.skills)} count={detail.skills.length}>
              {detail.skills.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  onToggle={handleSkillToggle}
                  onOpen={(selected) => setSelectedSkillName(selected.name)}
                />
              ))}
            </Section>
          )}

          {detail.mcpServers.length > 0 && (
            <Section title={intl.formatMessage(i18n.mcpServers)} count={detail.mcpServers.length}>
              {detail.mcpServers.map((name) => (
                <div key={name} className="py-3 text-base text-text-primary">
                  {name}
                </div>
              ))}
            </Section>
          )}

          {detail.apps.length > 0 && (
            <Section title={intl.formatMessage(i18n.apps)} count={detail.apps.length}>
              {detail.apps.map((app) => (
                <div key={app.id} className="py-3">
                  <div className="text-base text-text-primary">{app.name}</div>
                  {app.description && (
                    <div className="text-sm text-text-secondary">{app.description}</div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {detail.hooks.length > 0 && (
            <Section title={intl.formatMessage(i18n.hooks)} count={detail.hooks.length}>
              {detail.hooks.map((hook) => (
                <div key={hook.key} className="flex items-center gap-3 py-3">
                  <span className="text-base text-text-primary">{hook.key}</span>
                  <span className="text-sm text-text-secondary">{hook.eventName}</span>
                </div>
              ))}
            </Section>
          )}

          <Section title={intl.formatMessage(i18n.information)}>
            {iface?.capabilities.length ? (
              <InfoRow label={intl.formatMessage(i18n.capabilities)}>
                {iface.capabilities.join(', ')}
              </InfoRow>
            ) : null}
            {iface?.developerName && (
              <InfoRow label={intl.formatMessage(i18n.developer)}>{iface.developerName}</InfoRow>
            )}
            {iface?.category && (
              <InfoRow label={intl.formatMessage(i18n.category)}>{iface.category}</InfoRow>
            )}
            {(summary.localVersion || summary.version) && (
              <InfoRow label={intl.formatMessage(i18n.version)}>
                {summary.localVersion || summary.version}
              </InfoRow>
            )}
            <InfoRow label={intl.formatMessage(i18n.marketplace)}>
              {market.interface?.displayName || detail.marketplaceName}
            </InfoRow>
            {links.map((link) => (
              <InfoRow key={link.label} label={link.label}>
                <a
                  href={link.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate hover:underline"
                >
                  {link.url}
                </a>
              </InfoRow>
            ))}
          </Section>
        </>
      )}

      <SkillDetailsModal
        skill={selectedSkill}
        onClose={() => setSelectedSkillName(null)}
        onToggle={handleSkillToggle}
      />
    </div>
  );
}

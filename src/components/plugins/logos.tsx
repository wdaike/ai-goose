import { useState, type ReactNode } from 'react';
import { Zap } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLocalImage } from './localImage';
import type { PluginSummary } from '../../codex/protocol/v2/PluginSummary';
import type { SkillInterface } from '../../codex/protocol/v2/SkillInterface';
import { cn } from '../../utils';

export const pluginTitle = (plugin: PluginSummary) => plugin.interface?.displayName || plugin.name;

function Logo({
  name,
  url,
  brandColor,
  className,
  fallback,
}: {
  name: string;
  url: string | null;
  brandColor: string | null;
  className: string;
  fallback?: ReactNode;
}) {
  const [broken, setBroken] = useState(false);

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className={cn('object-cover', className)}
      />
    );
  }

  return (
    <div
      style={brandColor ? { backgroundColor: brandColor, color: '#fff' } : undefined}
      className={cn(
        'flex items-center justify-center font-medium uppercase',
        !brandColor && 'bg-background-secondary text-text-secondary',
        className
      )}
    >
      {fallback ?? name.slice(0, 1)}
    </div>
  );
}

export function PluginLogo({ plugin, className }: { plugin: PluginSummary; className: string }) {
  const { resolvedTheme } = useTheme();
  const iface = plugin.interface;
  const dark = resolvedTheme === 'dark';
  const remoteUrl = (dark ? iface?.logoUrlDark : null) ?? iface?.logoUrl ?? null;
  const localPath = remoteUrl ? null : ((dark ? iface?.logoDark : null) ?? iface?.logo ?? null);
  const localUrl = useLocalImage(localPath);

  return (
    <Logo
      name={pluginTitle(plugin)}
      url={remoteUrl ?? localUrl}
      brandColor={iface?.brandColor ?? null}
      className={className}
    />
  );
}

/** Shared by `SkillMetadata` (settings, skills list) and `SkillSummary` (plugin detail). */
export function SkillLogo({
  skill,
  className,
}: {
  skill: { name: string; interface?: SkillInterface | null };
  className: string;
}) {
  const iface = skill.interface;
  const remoteUrl = iface?.iconLargeUrl ?? iface?.iconSmallUrl ?? null;
  const localUrl = useLocalImage(
    remoteUrl ? null : (iface?.iconLarge ?? iface?.iconSmall ?? null)
  );

  return (
    <Logo
      name={iface?.displayName || skill.name}
      url={remoteUrl ?? localUrl}
      brandColor={iface?.brandColor ?? null}
      className={className}
      fallback={<Zap className="h-5 w-5" />}
    />
  );
}

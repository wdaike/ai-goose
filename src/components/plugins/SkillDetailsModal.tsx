import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, FolderOpen, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import MarkdownContent from '../MarkdownContent';
import { useLocalImage } from './localImage';
import { codex } from '../../codex/client';
import { skillDirectory } from '../../codex/engine/skillPolicy';
import { errorMessage } from '../../utils/conversionUtils';
import type { SkillMetadata } from '../../codex/protocol/v2/SkillMetadata';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  skillLabel: {
    id: 'skillDetails.skillLabel',
    defaultMessage: 'Skill',
  },
  open: {
    id: 'skillDetails.open',
    defaultMessage: 'Open',
  },
  errorLoadingContents: {
    id: 'skillDetails.errorLoadingContents',
    defaultMessage: 'Could not read SKILL.md',
  },
  toggleItem: {
    id: 'skillDetails.toggleItem',
    defaultMessage: 'Toggle {name} on or off',
  },
  tryNow: {
    id: 'skillDetails.tryNow',
    defaultMessage: 'Try now',
  },
  tryNowPrompt: {
    id: 'skillDetails.tryNowPrompt',
    defaultMessage: 'Use the {name} skill to ',
  },
  uninstall: {
    id: 'skillDetails.uninstall',
    defaultMessage: 'Uninstall',
  },
  uninstallTitle: {
    id: 'skillDetails.uninstallTitle',
    defaultMessage: 'Uninstall {name}?',
  },
  uninstallMessage: {
    id: 'skillDetails.uninstallMessage',
    defaultMessage: 'This deletes the skill folder from disk. It cannot be undone.',
  },
  cancel: {
    id: 'skillDetails.cancel',
    defaultMessage: 'Cancel',
  },
});

export function openSkillFolder(skill: SkillMetadata): void {
  window.electron.openDirectoryInExplorer(skillDirectory(skill.path));
}

function decodeUtf8(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The YAML header duplicates name/description, which the modal already shows. */
function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const closing = markdown.indexOf('\n---', 3);
  if (closing === -1) return markdown;
  const bodyStart = markdown.indexOf('\n', closing + 1);
  return bodyStart === -1 ? '' : markdown.slice(bodyStart + 1).trimStart();
}

function SkillIcon({ skill }: { skill: SkillMetadata }) {
  const iface = skill.interface;
  const localUrl = useLocalImage(iface?.iconLarge ?? iface?.iconSmall ?? null);

  return (
    <div
      style={iface?.brandColor ? { backgroundColor: iface.brandColor, color: '#fff' } : undefined}
      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-primary bg-background-secondary text-text-secondary"
    >
      {localUrl ? (
        <img src={localUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <Zap className="h-5 w-5" />
      )}
    </div>
  );
}

export default function SkillDetailsModal({
  skill,
  onClose,
  onToggle,
  onUninstall,
}: {
  skill: SkillMetadata | null;
  onClose: () => void;
  onToggle: (skill: SkillMetadata, enabled: boolean) => Promise<void>;
  /** Omitted for skills goose does not own on disk (codex system and plugin skills). */
  onUninstall?: (skill: SkillMetadata) => Promise<void>;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [contents, setContents] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isConfirmingUninstall, setIsConfirmingUninstall] = useState(false);

  const path = skill?.path;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setContents(null);
    setError(null);
    codex
      .fsReadFile({ path })
      .then(({ dataBase64 }) => {
        if (!cancelled) setContents(stripFrontmatter(decodeUtf8(dataBase64)));
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Failed to read skill'));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!skill) return null;

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

  const handleUninstall = async () => {
    if (busy || !onUninstall) return;
    setBusy(true);
    try {
      await onUninstall(skill);
      setIsConfirmingUninstall(false);
    } finally {
      setBusy(false);
    }
  };

  const handleTryNow = () => {
    const prompt =
      skill.interface?.defaultPrompt ?? intl.formatMessage(i18n.tryNowPrompt, { name: title });
    onClose();
    navigate('/pair', {
      state: { initialMessage: { msg: prompt, images: [] }, noAutoSubmit: true },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <div className="flex items-center gap-3 pr-16">
          <SkillIcon skill={skill} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-xl">
              {title}
              <span className="ml-2 text-base text-text-secondary">
                {intl.formatMessage(i18n.skillLabel)}
              </span>
            </DialogTitle>
          </div>
          <Switch
            checked={skill.enabled}
            onCheckedChange={handleToggle}
            disabled={busy}
            variant="mono"
            aria-label={intl.formatMessage(i18n.toggleItem, { name: title })}
          />
        </div>

        <p className="text-sm text-text-secondary">{skill.description}</p>

        <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
          {error ? (
            <p className="text-sm text-text-danger">
              {intl.formatMessage(i18n.errorLoadingContents)}: {error}
            </p>
          ) : contents === null ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : (
            <MarkdownContent content={contents} className="text-sm" />
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {onUninstall ? (
            <Button
              variant="ghost"
              className="h-9 rounded-full text-text-danger hover:bg-background-danger/10"
              disabled={busy}
              onClick={() => setIsConfirmingUninstall(true)}
            >
              {intl.formatMessage(i18n.uninstall)}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 gap-1.5 rounded-full"
              onClick={() => openSkillFolder(skill)}
            >
              <FolderOpen className="h-4 w-4" />
              {intl.formatMessage(i18n.open)}
            </Button>
            <Button className="h-9 gap-1.5 rounded-full" onClick={handleTryNow}>
              <Box className="h-4 w-4" />
              {intl.formatMessage(i18n.tryNow)}
            </Button>
          </div>
        </div>
      </DialogContent>

      <ConfirmationModal
        isOpen={isConfirmingUninstall}
        title={intl.formatMessage(i18n.uninstallTitle, { name: title })}
        message={intl.formatMessage(i18n.uninstallMessage)}
        detail={skillDirectory(skill.path)}
        confirmLabel={intl.formatMessage(i18n.uninstall)}
        cancelLabel={intl.formatMessage(i18n.cancel)}
        confirmVariant="destructive"
        isSubmitting={busy}
        onConfirm={handleUninstall}
        onCancel={() => setIsConfirmingUninstall(false)}
      />
    </Dialog>
  );
}

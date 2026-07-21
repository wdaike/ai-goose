import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Edit2, Folder, LoaderCircle, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { AppEvents } from '../constants/events';
import { defineMessages, useIntl } from '../i18n';
import { acpDeleteSession, acpForkSession, acpRenameSession } from '../acp/sessions';
import { getSessionDisplayName } from '../sessions';
import type { Session } from '../types/session';
import { errorMessage } from '../utils/conversionUtils';
import { useNavigationContextSafe } from './Layout/NavigationContext';
import { cn } from '../utils';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const i18n = defineMessages({
  actionsLabel: {
    id: 'sessionActionsHeader.actionsLabel',
    defaultMessage: 'Session actions',
  },
  renameSession: {
    id: 'sessionActionsHeader.renameSession',
    defaultMessage: 'Rename chat',
  },
  duplicateSession: {
    id: 'sessionActionsHeader.duplicateSession',
    defaultMessage: 'Duplicate chat',
  },
  deleteSession: {
    id: 'sessionActionsHeader.deleteSession',
    defaultMessage: 'Delete chat',
  },
  renameTitle: {
    id: 'sessionActionsHeader.renameTitle',
    defaultMessage: 'Rename Session',
  },
  renamePlaceholder: {
    id: 'sessionActionsHeader.renamePlaceholder',
    defaultMessage: 'Enter session name',
  },
  cancel: {
    id: 'sessionActionsHeader.cancel',
    defaultMessage: 'Cancel',
  },
  save: {
    id: 'sessionActionsHeader.save',
    defaultMessage: 'Save',
  },
  saving: {
    id: 'sessionActionsHeader.saving',
    defaultMessage: 'Saving...',
  },
  renamed: {
    id: 'sessionActionsHeader.renamed',
    defaultMessage: 'Session renamed',
  },
  renameFailed: {
    id: 'sessionActionsHeader.renameFailed',
    defaultMessage: 'Failed to rename session: {error}',
  },
  duplicated: {
    id: 'sessionActionsHeader.duplicated',
    defaultMessage: 'Session duplicated',
  },
  duplicateFailed: {
    id: 'sessionActionsHeader.duplicateFailed',
    defaultMessage: 'Failed to duplicate session: {error}',
  },
  deleteTitle: {
    id: 'sessionActionsHeader.deleteTitle',
    defaultMessage: 'Delete Session',
  },
  deleteConfirm: {
    id: 'sessionActionsHeader.deleteConfirm',
    defaultMessage: 'Delete "{name}"? This cannot be undone.',
  },
  deleting: {
    id: 'sessionActionsHeader.deleting',
    defaultMessage: 'Deleting...',
  },
  deleted: {
    id: 'sessionActionsHeader.deleted',
    defaultMessage: 'Session deleted',
  },
  deleteFailed: {
    id: 'sessionActionsHeader.deleteFailed',
    defaultMessage: 'Failed to delete session: {error}',
  },
});

interface SessionActionsHeaderProps {
  session?: Session;
  onSessionChange: (updater: (session: Session) => Session) => void;
  className?: string;
}

export default function SessionActionsHeader({
  session,
  onSessionChange,
  className,
}: SessionActionsHeaderProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const title = useMemo(() => (session ? getSessionDisplayName(session) : ''), [session]);

  // With the sidebar collapsed the title has to clear the floating nav toggle,
  // which sits after the macOS window controls.
  const isNavExpanded = useNavigationContextSafe()?.isNavExpanded ?? true;
  const isMacOS = (window?.electron?.platform || 'darwin') === 'darwin';
  const headerLeft = isNavExpanded ? 'left-4' : isMacOS ? 'left-[140px]' : 'left-[60px]';

  useEffect(() => {
    if (session && isRenameOpen) {
      setRenameValue(getSessionDisplayName(session));
    }
  }, [isRenameOpen, session]);

  const handleRename = useCallback(async () => {
    if (!session || isRenaming) return;

    const trimmedName = renameValue.trim();
    if (!trimmedName) return;

    if (trimmedName === session.name) {
      setIsRenameOpen(false);
      return;
    }

    setIsRenaming(true);
    try {
      await acpRenameSession(session.id, trimmedName);
      onSessionChange((current) => ({ ...current, name: trimmedName, user_set_name: true }));
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_RENAMED, {
          detail: { sessionId: session.id, newName: trimmedName, userInitiated: true },
        })
      );
      setIsRenameOpen(false);
      toast.success(intl.formatMessage(i18n.renamed));
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.renameFailed, {
          error: errorMessage(error, 'Unknown error'),
        })
      );
    } finally {
      setIsRenaming(false);
    }
  }, [intl, isRenaming, onSessionChange, renameValue, session]);

  const handleDuplicate = useCallback(async () => {
    if (!session || isDuplicating) return;

    setIsDuplicating(true);
    try {
      await acpForkSession(session.id);
      window.dispatchEvent(new CustomEvent(AppEvents.SESSION_CREATED));
      toast.success(intl.formatMessage(i18n.duplicated));
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.duplicateFailed, {
          error: errorMessage(error, 'Unknown error'),
        })
      );
    } finally {
      setIsDuplicating(false);
    }
  }, [intl, isDuplicating, session]);

  const handleDelete = useCallback(async () => {
    if (!session || isDeleting) return;

    setIsDeleting(true);
    try {
      await acpDeleteSession(session.id);
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_DELETED, { detail: { sessionId: session.id } })
      );
      setIsDeleteOpen(false);
      toast.success(intl.formatMessage(i18n.deleted));
      navigate('/');
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.deleteFailed, {
          error: errorMessage(error, 'Unknown error'),
        })
      );
    } finally {
      setIsDeleting(false);
    }
  }, [intl, isDeleting, navigate, session]);

  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        void handleRename();
      }
    },
    [handleRename]
  );

  if (!session) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          'no-drag absolute top-[14px] z-30 flex max-w-[min(36rem,calc(100vw-18rem))] items-center gap-1.5',
          headerLeft,
          className
        )}
      >
        <Folder className="size-4 flex-shrink-0 text-text-secondary" />
        <span className="truncate text-[13px] font-medium text-text-primary" title={title}>
          {title}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-6 flex-shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active"
              aria-label={intl.formatMessage(i18n.actionsLabel)}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => setIsRenameOpen(true)}>
              <Edit2 className="size-4" />
              {intl.formatMessage(i18n.renameSession)}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isDuplicating} onSelect={() => void handleDuplicate()}>
              {isDuplicating ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}
              {intl.formatMessage(i18n.duplicateSession)}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-text-danger focus:text-text-danger"
              onSelect={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              {intl.formatMessage(i18n.deleteSession)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(i18n.renameTitle)}</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={handleRenameKeyDown}
            placeholder={intl.formatMessage(i18n.renamePlaceholder)}
            className="w-full rounded-lg border border-border-primary bg-background-primary p-3 text-text-primary outline-none focus:ring-2 focus:ring-border-active"
            disabled={isRenaming}
            maxLength={200}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)} disabled={isRenaming}>
              {intl.formatMessage(i18n.cancel)}
            </Button>
            <Button
              onClick={() => void handleRename()}
              disabled={isRenaming || !renameValue.trim()}
            >
              {isRenaming ? intl.formatMessage(i18n.saving) : intl.formatMessage(i18n.save)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(i18n.deleteTitle)}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            {intl.formatMessage(i18n.deleteConfirm, { name: title })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
              {intl.formatMessage(i18n.cancel)}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={isDeleting}>
              {isDeleting
                ? intl.formatMessage(i18n.deleting)
                : intl.formatMessage(i18n.deleteSession)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

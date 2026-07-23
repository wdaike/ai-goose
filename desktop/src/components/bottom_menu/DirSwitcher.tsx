import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Plus, Search, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { FolderClosed } from '../icons/Folder';
import { toast } from 'react-toastify';
import { defineMessages, useIntl } from '../../i18n';
import { acpListRecentSessions } from '../../acp/sessions';

const i18n = defineMessages({
  failedToUpdateWorkingDir: {
    id: 'dirSwitcher.failedToUpdateWorkingDir',
    defaultMessage: 'Failed to update working directory',
  },
  searchProjects: {
    id: 'dirSwitcher.searchProjects',
    defaultMessage: 'Search projects',
  },
  newProject: {
    id: 'dirSwitcher.newProject',
    defaultMessage: 'New project',
  },
  noProject: {
    id: 'dirSwitcher.noProject',
    defaultMessage: "Don't work in a project",
  },
});

const leafName = (dir: string): string =>
  dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || dir;

interface DirSwitcherProps {
  className: string;
  sessionId: string | undefined;
  workingDir: string;
  onWorkingDirChange?: (newDir: string) => Promise<void> | void;
  onRestartStart?: () => void;
  onRestartEnd?: () => void;
}

/**
 * ChatGPT-Codex-style project picker for the chat input's bottom bar.
 *
 * The trigger is a "<folder> <name>" pill; the popover is a searchable list
 * of projects (recent working directories) with a check on the current one,
 * plus "New project" (directory chooser) and "Don't work in a project"
 * (drops back to the home directory), mirroring the Codex composer.
 */
export const DirSwitcher: React.FC<DirSwitcherProps> = ({
  className,
  sessionId,
  workingDir,
  onWorkingDirChange,
  onRestartStart,
  onRestartEnd,
}) => {
  const intl = useIntl();
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isDirectoryChooserOpen, setIsDirectoryChooserOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const homeDir = (window.appConfig?.get('GOOSE_HOME_DIR') as string | undefined) ?? '';

  const refreshMenuData = useCallback(async () => {
    const [recent, sessions] = await Promise.all([
      window.electron.listRecentDirs().catch(() => [] as string[]),
      acpListRecentSessions(100).catch(() => []),
    ]);
    const sessionDirs = sessions.map((session) => session.workingDir);
    setRecentDirs([...new Set([...sessionDirs, ...recent])]);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    setQuery('');
    void refreshMenuData();
    // Radix moves focus to the menu content on open; steal it for the search
    // field afterwards so typing filters immediately, like the Codex picker.
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [isMenuOpen, refreshMenuData]);

  const applyDirectoryChange = async (newDir: string) => {
    window.electron.addRecentDir(newDir);
    setRecentDirs((previous) => [newDir, ...previous.filter((dir) => dir !== newDir)]);

    if (sessionId) {
      onRestartStart?.();

      try {
        await onWorkingDirChange?.(newDir);
      } catch (error) {
        console.error('[DirSwitcher] Failed to update working directory:', error);
        toast.error(intl.formatMessage(i18n.failedToUpdateWorkingDir));
      } finally {
        onRestartEnd?.();
      }
    } else {
      await onWorkingDirChange?.(newDir);
    }
  };

  const handleDirectoryChange = async () => {
    if (isDirectoryChooserOpen) return;
    setIsDirectoryChooserOpen(true);

    let result;
    try {
      result = await window.electron.directoryChooser();
    } finally {
      setIsDirectoryChooserOpen(false);
    }

    if (result.canceled || result.filePaths.length === 0) {
      return;
    }

    const newDir = result.filePaths[0];
    await applyDirectoryChange(newDir);
  };

  const handleSelectDirectory = async (newDir: string) => {
    setIsMenuOpen(false);
    if (!newDir || newDir === workingDir) return;
    await applyDirectoryChange(newDir);
  };

  const handleDirectoryClick = async (event: React.MouseEvent) => {
    if (isDirectoryChooserOpen) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const isCmdOrCtrlClick = event.metaKey || event.ctrlKey;

    if (isCmdOrCtrlClick) {
      event.preventDefault();
      event.stopPropagation();
      await window.electron.openDirectoryInExplorer(workingDir);
    }
  };

  const isInProject = workingDir !== homeDir;

  const projects = useMemo(() => {
    const all = isInProject ? [workingDir, ...recentDirs] : recentDirs;
    const deduped = [...new Set(all)].filter((dir) => dir && dir !== homeDir);
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return deduped;
    return deduped.filter((dir) => leafName(dir).toLowerCase().includes(trimmed));
  }, [recentDirs, workingDir, homeDir, isInProject, query]);

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Keep typed characters in the input instead of feeding Radix's typeahead,
    // but let Escape (close) and the arrow keys (list navigation) through.
    if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return;
    event.stopPropagation();
    if (event.key === 'Enter' && projects.length > 0) {
      void handleSelectDirectory(projects[0]);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip
        open={isTooltipOpen && !isDirectoryChooserOpen && !isMenuOpen}
        onOpenChange={(open) => {
          if (!isDirectoryChooserOpen && !isMenuOpen) setIsTooltipOpen(open);
        }}
      >
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex min-w-0 items-center gap-1.5 rounded-full bg-background-tertiary px-3 py-1.5 text-sm text-text-primary transition-colors ${isDirectoryChooserOpen ? 'opacity-50' : 'hover:cursor-pointer hover:bg-background-tertiary/70'} ${className}`}
                onClick={handleDirectoryClick}
                disabled={isDirectoryChooserOpen}
              >
                <FolderClosed className="h-4 w-4 flex-shrink-0" />
                <span className="max-w-[200px] truncate">
                  {isInProject ? leafName(workingDir) : intl.formatMessage(i18n.noProject)}
                </span>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-72 rounded-2xl p-1.5"
          >
            {/* Search row */}
            <div className="flex items-center gap-2 px-2.5 py-2">
              <Search className="h-4 w-4 flex-shrink-0 text-text-secondary" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={intl.formatMessage(i18n.searchProjects)}
                className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
              />
            </div>

            {/* Project list */}
            <div className="max-h-64 overflow-y-auto">
              {projects.map((dir) => (
                <DropdownMenuItem
                  key={dir}
                  className="rounded-lg px-2.5 py-2"
                  onSelect={() => void handleSelectDirectory(dir)}
                >
                  <FolderClosed className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{leafName(dir)}</span>
                  {dir === workingDir && <Check className="ml-auto h-4 w-4 flex-shrink-0" />}
                </DropdownMenuItem>
              ))}
            </div>

            <DropdownMenuSeparator />

            {/* New project */}
            <DropdownMenuItem
              className="rounded-lg px-2.5 py-2"
              onSelect={() => void handleDirectoryChange()}
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              <span>{intl.formatMessage(i18n.newProject)}</span>
              <ChevronRight className="ml-auto h-4 w-4 flex-shrink-0" />
            </DropdownMenuItem>

            {/* Don't work in a project */}
            <DropdownMenuItem
              className="rounded-lg px-2.5 py-2"
              onSelect={() => void handleSelectDirectory(homeDir)}
            >
              <X className="h-4 w-4 flex-shrink-0" />
              <span>{intl.formatMessage(i18n.noProject)}</span>
              {!isInProject && <Check className="ml-auto h-4 w-4 flex-shrink-0" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent side="top">{workingDir}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

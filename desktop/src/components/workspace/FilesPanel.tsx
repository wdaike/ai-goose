import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, File, RotateCw, X } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { FolderClosed } from '../icons/Folder';
import { useWorkspacePanels } from '../../contexts/WorkspacePanelsContext';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../utils';
import type { DirectoryEntry } from '../../preload';

const i18n = defineMessages({
  filesTitle: {
    id: 'filesPanel.title',
    defaultMessage: 'Files',
  },
  refresh: {
    id: 'filesPanel.refresh',
    defaultMessage: 'Refresh',
  },
  closePanel: {
    id: 'filesPanel.closePanel',
    defaultMessage: 'Close panel',
  },
  emptyDirectory: {
    id: 'filesPanel.emptyDirectory',
    defaultMessage: 'Empty directory',
  },
});

interface DirectoryNodeProps {
  path: string;
  name: string;
  depth: number;
}

function useDirectoryEntries(path: string, enabled: boolean, refreshToken: number) {
  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    window.electron.listDirectory(path).then((result) => {
      if (!cancelled) {
        setEntries(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path, enabled, refreshToken]);

  return entries;
}

function EntryRow({
  depth,
  onClick,
  children,
}: {
  depth: number;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-[12.5px]',
        'text-text-secondary hover:bg-background-secondary hover:text-text-primary',
        !onClick && 'cursor-default hover:bg-transparent'
      )}
    >
      {children}
    </button>
  );
}

function DirectoryNode({ path, name, depth }: DirectoryNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const entries = useDirectoryEntries(path, expanded, 0);

  return (
    <div>
      <EntryRow depth={depth} onClick={() => setExpanded((value) => !value)}>
        {expanded ? (
          <ChevronDown className="size-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="size-3 flex-shrink-0" />
        )}
        <FolderClosed className="size-3.5 flex-shrink-0" />
        <span className="truncate">{name}</span>
      </EntryRow>
      {expanded && entries && (
        <DirectoryChildren parentPath={path} entries={entries} depth={depth + 1} />
      )}
    </div>
  );
}

function DirectoryChildren({
  parentPath,
  entries,
  depth,
}: {
  parentPath: string;
  entries: DirectoryEntry[];
  depth: number;
}) {
  return (
    <>
      {entries.map((entry) => {
        const childPath = `${parentPath.replace(/\/+$/, '')}/${entry.name}`;
        return entry.isDirectory ? (
          <DirectoryNode key={childPath} path={childPath} name={entry.name} depth={depth} />
        ) : (
          <EntryRow key={childPath} depth={depth}>
            <span className="size-3 flex-shrink-0" />
            <File className="size-3.5 flex-shrink-0" />
            <span className="truncate">{entry.name}</span>
          </EntryRow>
        );
      })}
    </>
  );
}

export default function FilesPanel() {
  const intl = useIntl();
  const { isSidePanelOpen, toggleSidePanel, workingDir } = useWorkspacePanels();
  const [refreshToken, setRefreshToken] = useState(0);
  const rootEntries = useDirectoryEntries(workingDir, isSidePanelOpen, refreshToken);

  const handleRefresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  if (!isSidePanelOpen) {
    return null;
  }

  const rootName = workingDir.replace(/\/+$/, '').split('/').pop() || workingDir;

  return (
    <div className="flex w-[280px] flex-shrink-0 flex-col min-h-0 border-l border-border-primary bg-background-primary">
      {/* Clears the titlebar strip where the floating panel toggles live. */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-[46px]">
        <FolderClosed className="size-4 flex-shrink-0 text-text-secondary" />
        <span className="truncate text-[13px] font-medium text-text-primary" title={workingDir}>
          {rootName}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label={intl.formatMessage(i18n.refresh)}
          title={intl.formatMessage(i18n.refresh)}
          onClick={handleRefresh}
          className="flex size-6 items-center justify-center rounded-md text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
        >
          <RotateCw className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={intl.formatMessage(i18n.closePanel)}
          title={intl.formatMessage(i18n.closePanel)}
          onClick={toggleSidePanel}
          className="flex size-6 items-center justify-center rounded-md text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <ScrollArea className="flex-1 min-h-0 px-1.5 pb-2">
        {rootEntries && rootEntries.length === 0 ? (
          <div className="px-2 py-1 text-[12.5px] text-text-secondary">
            {intl.formatMessage(i18n.emptyDirectory)}
          </div>
        ) : (
          rootEntries && (
            <DirectoryChildren parentPath={workingDir} entries={rootEntries} depth={0} />
          )
        )}
      </ScrollArea>
    </div>
  );
}

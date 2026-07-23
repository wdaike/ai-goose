import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  File,
  FileWarning,
  LoaderCircle,
  RotateCw,
  X,
} from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { FolderClosed } from '../icons/Folder';
import { useWorkspacePanels } from '../../contexts/WorkspacePanelsContext';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../utils';
import type { DirectoryEntry } from '../../preload';
import { codex } from '../../codex/client';
import CodeViewer, { languageFromFilePath } from '../CodeViewer';

const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES = 10 * 1024 * 1024;

const IMAGE_MIME_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

type FilePreview =
  | { kind: 'text'; content: string }
  | { kind: 'image'; src: string }
  | { kind: 'binary' }
  | { kind: 'tooLarge' };

function decodeBase64(dataBase64: string): Uint8Array {
  const binary = window.atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function createFilePreview(path: string, dataBase64: string): FilePreview {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const imageMimeType = IMAGE_MIME_TYPES[extension];
  const bytes = decodeBase64(dataBase64);

  if (imageMimeType) {
    return bytes.length <= MAX_IMAGE_PREVIEW_BYTES
      ? { kind: 'image', src: `data:${imageMimeType};base64,${dataBase64}` }
      : { kind: 'tooLarge' };
  }

  if (bytes.length > MAX_TEXT_PREVIEW_BYTES) {
    return { kind: 'tooLarge' };
  }

  if (bytes.subarray(0, 8000).includes(0)) {
    return { kind: 'binary' };
  }

  try {
    return { kind: 'text', content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { kind: 'binary' };
  }
}

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
  backToFiles: {
    id: 'filesPanel.backToFiles',
    defaultMessage: 'Back to files',
  },
  loadingFile: {
    id: 'filesPanel.loadingFile',
    defaultMessage: 'Loading file…',
  },
  failedToReadFile: {
    id: 'filesPanel.failedToReadFile',
    defaultMessage: 'Unable to preview this file',
  },
  binaryFile: {
    id: 'filesPanel.binaryFile',
    defaultMessage: 'Binary files cannot be previewed.',
  },
  fileTooLarge: {
    id: 'filesPanel.fileTooLarge',
    defaultMessage: 'This file is too large to preview.',
  },
});

interface DirectoryNodeProps {
  path: string;
  name: string;
  depth: number;
  onFileSelect: (path: string, name: string) => void;
  refreshToken: number;
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

function DirectoryNode({ path, name, depth, onFileSelect, refreshToken }: DirectoryNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const entries = useDirectoryEntries(path, expanded, refreshToken);

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
        <DirectoryChildren
          parentPath={path}
          entries={entries}
          depth={depth + 1}
          onFileSelect={onFileSelect}
          refreshToken={refreshToken}
        />
      )}
    </div>
  );
}

function DirectoryChildren({
  parentPath,
  entries,
  depth,
  onFileSelect,
  refreshToken,
}: {
  parentPath: string;
  entries: DirectoryEntry[];
  depth: number;
  onFileSelect: (path: string, name: string) => void;
  refreshToken: number;
}) {
  return (
    <>
      {entries.map((entry) => {
        const childPath = `${parentPath.replace(/\/+$/, '')}/${entry.name}`;
        return entry.isDirectory ? (
          <DirectoryNode
            key={childPath}
            path={childPath}
            name={entry.name}
            depth={depth}
            onFileSelect={onFileSelect}
            refreshToken={refreshToken}
          />
        ) : (
          <EntryRow
            key={childPath}
            depth={depth}
            onClick={() => onFileSelect(childPath, entry.name)}
          >
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
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const rootEntries = useDirectoryEntries(workingDir, isSidePanelOpen, refreshToken);

  const handleRefresh = useCallback(() => {
    if (selectedFile) {
      setPreviewRefreshToken((token) => token + 1);
    } else {
      setRefreshToken((token) => token + 1);
    }
  }, [selectedFile]);

  const handleFileSelect = useCallback((path: string, name: string) => {
    setSelectedFile({ path, name });
  }, []);

  useEffect(() => {
    setSelectedFile(null);
  }, [workingDir]);

  useEffect(() => {
    if (!selectedFile) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return undefined;
    }

    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);

    codex
      .fsReadFile({ path: selectedFile.path })
      .then(({ dataBase64 }) => {
        if (!cancelled) {
          setPreview(createFilePreview(selectedFile.path, dataBase64));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile, previewRefreshToken]);

  if (!isSidePanelOpen) {
    return null;
  }

  const rootName = workingDir.replace(/\/+$/, '').split('/').pop() || workingDir;
  const title = selectedFile?.name ?? rootName;

  return (
    <div
      className={cn(
        'flex flex-shrink-0 flex-col min-h-0 border-l border-border-primary bg-background-primary transition-[width] duration-200',
        selectedFile ? 'w-[min(520px,42vw)]' : 'w-[280px]'
      )}
    >
      <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-[46px]">
        {selectedFile ? (
          <button
            type="button"
            aria-label={intl.formatMessage(i18n.backToFiles)}
            title={intl.formatMessage(i18n.backToFiles)}
            onClick={() => setSelectedFile(null)}
            className="flex size-6 flex-shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
          >
            <ArrowLeft className="size-3.5" />
          </button>
        ) : (
          <FolderClosed className="size-4 flex-shrink-0 text-text-secondary" />
        )}
        <span
          className="truncate text-[13px] font-medium text-text-primary"
          title={selectedFile?.path ?? workingDir}
        >
          {title}
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
      {selectedFile && (
        <div className="flex flex-1 min-h-0 flex-col border-t border-border-primary">
          {previewLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-text-secondary">
              <LoaderCircle className="size-4 animate-spin" />
              {intl.formatMessage(i18n.loadingFile)}
            </div>
          ) : previewError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <FileWarning className="size-5 text-text-secondary" />
              <div className="text-sm font-medium text-text-primary">
                {intl.formatMessage(i18n.failedToReadFile)}
              </div>
              <div className="max-w-full break-words text-xs text-text-secondary">
                {previewError}
              </div>
            </div>
          ) : preview?.kind === 'text' ? (
            <CodeViewer
              code={preview.content}
              language={languageFromFilePath(selectedFile.path)}
              showLineNumbers
              surface="primary"
              fontSize={12}
              className="flex-1 min-h-0"
            />
          ) : preview?.kind === 'image' ? (
            <div className="flex flex-1 min-h-0 items-center justify-center overflow-auto p-4">
              <img
                src={preview.src}
                alt={selectedFile.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : preview ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-secondary">
              <FileWarning className="size-5" />
              {intl.formatMessage(preview.kind === 'binary' ? i18n.binaryFile : i18n.fileTooLarge)}
            </div>
          ) : null}
        </div>
      )}
      <div className={cn('flex-1 min-h-0', selectedFile && 'hidden')}>
        <ScrollArea className="h-full px-1.5 pb-2">
          {rootEntries && rootEntries.length === 0 ? (
            <div className="px-2 py-1 text-[12.5px] text-text-secondary">
              {intl.formatMessage(i18n.emptyDirectory)}
            </div>
          ) : (
            rootEntries && (
              <DirectoryChildren
                parentPath={workingDir}
                entries={rootEntries}
                depth={0}
                onFileSelect={handleFileSelect}
                refreshToken={refreshToken}
              />
            )
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

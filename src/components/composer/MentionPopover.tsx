import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ItemIcon } from '../conversation/ItemIcon';
import { getInitialWorkingDir } from '../../utils/workingDir';
import { defineMessages, useIntl } from '../../i18n';
import {
  mentionInsertText,
  rankMentionItems,
  type DisplayItem,
  type DisplayItemWithMatch,
} from '../../codex/engine/mentionRanking';

export type { DisplayItem, DisplayItemWithMatch };
import { listAgentMentionItems, listSlashCommandItems } from '../../acp/autocomplete';

const i18n = defineMessages({
  scanningFiles: {
    id: 'mentionPopover.scanningFiles',
    defaultMessage: 'Scanning files...',
  },
  loadingCommands: {
    id: 'mentionPopover.loadingCommands',
    defaultMessage: 'Loading commands...',
  },
  itemsFound: {
    id: 'mentionPopover.itemsFound',
    defaultMessage: '{count, plural, one {# item} other {# items}} found',
  },
  noItemsFound: {
    id: 'mentionPopover.noItemsFound',
    defaultMessage: 'No items found matching "{query}"',
  },
  noCommandsFound: {
    id: 'mentionPopover.noCommandsFound',
    defaultMessage: 'No commands found matching "{query}"',
  },
  noCommandsAvailable: {
    id: 'mentionPopover.noCommandsAvailable',
    defaultMessage: 'No commands available',
  },
});

interface MentionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (insertText: string, item: DisplayItem) => void;
  position: { x: number; y: number };
  query: string;
  isSlashCommand: boolean;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  workingDir?: string;
  sessionId?: string | null;
}

const MentionPopover = forwardRef<
  { getDisplayFiles: () => DisplayItemWithMatch[]; selectFile: (index: number) => void },
  MentionPopoverProps
>(
  (
    {
      isOpen,
      onClose,
      onSelect,
      position,
      query,
      isSlashCommand,
      selectedIndex,
      onSelectedIndexChange,
      workingDir,
      sessionId,
    },
    ref
  ) => {
    const intl = useIntl();
    const [items, setItems] = useState<DisplayItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const currentWorkingDir = workingDir ?? getInitialWorkingDir();

    const scanDirectoryFromRoot = useCallback(
      async (dirPath: string, relativePath = '', depth = 0): Promise<DisplayItem[]> => {
        // Increase depth limit for better file discovery
        if (depth > 5) return [];

        try {
          const items = await window.electron.listFiles(dirPath);
          const results: DisplayItem[] = [];

          // Common directories to prioritize or skip
          const priorityDirs = [
            'Desktop',
            'Documents',
            'Downloads',
            'Projects',
            'Development',
            'Code',
            'src',
            'components',
            'icons',
          ];
          const skipDirs = [
            '.git',
            '.svn',
            '.hg',
            'node_modules',
            '__pycache__',
            'target',
            'dist',
            'build',
            '.cache',
            '.npm',
            '.yarn',
            'Library',
            'System',
            'Applications',
            '.Trash',
          ];

          const allowedHiddenDirs = [
            '.github',
            '.vscode',
            '.idea',
            '.config',
            '.gitlab',
            '.circleci',
            '.azure',
            '.jenkins',
          ];

          // Don't skip as many directories at deeper levels to find more items
          const skipDirsAtDepth =
            depth > 2 ? ['.git', '.svn', '.hg', 'node_modules', '__pycache__'] : skipDirs;

          // Sort items to prioritize certain directories
          const sortedItems = items.sort((a, b) => {
            const aPriority = priorityDirs.includes(a);
            const bPriority = priorityDirs.includes(b);
            if (aPriority && !bPriority) return -1;
            if (!aPriority && bPriority) return 1;
            return a.localeCompare(b);
          });

          // Increase item limit per directory for better coverage
          const itemLimit = depth === 0 ? 50 : depth === 1 ? 40 : 30;

          for (const item of sortedItems.slice(0, itemLimit)) {
            const fullPath = `${dirPath}/${item}`;
            const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;

            // Skip items in the skip list
            if (skipDirsAtDepth.includes(item)) {
              continue;
            }

            // Skip hidden items except for allowed hidden directories
            if (item.startsWith('.') && !allowedHiddenDirs.includes(item)) {
              continue;
            }

            // First, check if this looks like a file based on extension
            const hasExtension = item.includes('.');
            const ext = item.split('.').pop()?.toLowerCase();
            const commonExtensions = [
              // Code items
              'txt',
              'md',
              'js',
              'ts',
              'jsx',
              'tsx',
              'py',
              'java',
              'cpp',
              'c',
              'h',
              'css',
              'html',
              'json',
              'xml',
              'yaml',
              'yml',
              'toml',
              'ini',
              'cfg',
              'sh',
              'bat',
              'ps1',
              'rb',
              'go',
              'rs',
              'php',
              'sql',
              'r',
              'scala',
              'swift',
              'kt',
              'dart',
              'vue',
              'svelte',
              'astro',
              'scss',
              'less',
              // Documentation
              'readme',
              'license',
              'changelog',
              'contributing',
              // Config items
              'gitignore',
              'dockerignore',
              'editorconfig',
              'prettierrc',
              'eslintrc',
              // Images and assets
              'png',
              'jpg',
              'jpeg',
              'gif',
              'svg',
              'ico',
              'webp',
              'bmp',
              'tiff',
              'tif',
              // Vector and design items
              'ai',
              'eps',
              'sketch',
              'fig',
              'xd',
              'psd',
              // Other common items
              'pdf',
              'doc',
              'docx',
              'xls',
              'xlsx',
              'ppt',
              'pptx',
            ];

            // If it has a known file extension, treat it as a file
            if (hasExtension && ext && commonExtensions.includes(ext)) {
              results.push({
                extra: fullPath,
                name: item,
                itemType: 'File',
                relativePath: itemRelativePath,
              });
              continue;
            }

            // If it's a known file without extension (README, LICENSE, etc.)
            const knownFiles = [
              'readme',
              'license',
              'changelog',
              'contributing',
              'dockerfile',
              'makefile',
            ];
            if (!hasExtension && knownFiles.includes(item.toLowerCase())) {
              results.push({
                extra: fullPath,
                name: item,
                itemType: 'File',
                relativePath: itemRelativePath,
              });
              continue;
            }

            // Otherwise, try to determine if it's a directory
            try {
              await window.electron.listFiles(fullPath);

              results.push({
                name: item,
                extra: fullPath,
                itemType: 'Directory',
                relativePath: itemRelativePath,
              });

              // Recursively scan directories more aggressively
              if (depth < 4 || priorityDirs.includes(item)) {
                const subFiles = await scanDirectoryFromRoot(fullPath, itemRelativePath, depth + 1);
                results.push(...subFiles);
              }
            } catch {
              // If we can't list it and it doesn't have a known extension, skip it
              // This could be a file with an unknown extension or a permission issue
            }
          }

          return results;
        } catch (error) {
          console.error(`Error scanning directory ${dirPath}:`, error);
          return [];
        }
      },
      []
    );

    const getDefaultStartPath = (): string => {
      if (window.electron.platform === 'win32') return 'C:\\Users';
      if (window.electron.platform === 'linux') return '/home';
      return '/Users';
    };

    const displayItems = useMemo(
      () => rankMentionItems(items, query, currentWorkingDir),
      [items, query, currentWorkingDir]
    );

    // Expose methods to parent component
    useImperativeHandle(
      ref,
      () => ({
        getDisplayFiles: () => displayItems,
        selectFile: (index: number) => {
          if (displayItems[index]) {
            onSelect(mentionInsertText(displayItems[index]), displayItems[index]);
            onClose();
          }
        },
      }),
      [displayItems, onSelect, onClose]
    );

    useEffect(() => {
      let cancelled = false;

      const loadData = async () => {
        setItems([]);
        setIsLoading(true);
        try {
          if (isSlashCommand) {
            const commandItems = await listSlashCommandItems(currentWorkingDir);
            if (cancelled) return;
            setItems(commandItems);
          } else {
            // Fetch agents from server and scan files in parallel
            const [agentItems, scannedFiles] = await Promise.all([
              listAgentMentionItems(currentWorkingDir, sessionId ?? undefined).catch(() => []),
              scanDirectoryFromRoot(currentWorkingDir || getDefaultStartPath()),
            ]);
            if (cancelled) return;
            setItems([...agentItems, ...scannedFiles]);
          }
        } catch (error) {
          if (!cancelled) {
            console.error('Error loading popover items:', error);
            setItems([]);
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      };

      if (isOpen) {
        loadData();
      }

      return () => {
        cancelled = true;
      };
    }, [isOpen, isSlashCommand, scanDirectoryFromRoot, currentWorkingDir, sessionId]);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
          onClose();
        }
      };

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen, onClose]);

    // Scroll selected item into view
    useEffect(() => {
      if (listRef.current && selectedIndex >= 0 && selectedIndex < displayItems.length) {
        const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
        if (selectedElement) {
          selectedElement.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
          });
        }
      }
    }, [selectedIndex, displayItems.length]);

    const handleItemClick = (index: number) => {
      if (index >= 0 && index < displayItems.length) {
        onSelectedIndexChange(index);
        onSelect(mentionInsertText(displayItems[index]), displayItems[index]);
        onClose();
      }
    };

    if (!isOpen) return null;

    return (
      <div
        ref={popoverRef}
        className="fixed z-50 bg-background-primary border border-border-primary rounded-lg shadow-lg min-w-96 max-w-lg max-h-80"
        style={{
          left: position.x,
          top: position.y - 10, // Position above the chat input
          transform: 'translateY(-100%)', // Move it fully above
        }}
      >
        <div className="p-3 flex flex-col max-h-80">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2"></div>
              <span className="ml-2 text-sm text-text-secondary">
                {intl.formatMessage(isSlashCommand ? i18n.loadingCommands : i18n.scanningFiles)}
              </span>
            </div>
          ) : (
            <>
              {displayItems.length > 0 && (
                <div className="text-xs text-text-secondary mb-2 px-1">
                  {intl.formatMessage(i18n.itemsFound, { count: displayItems.length })}
                </div>
              )}
              <div
                ref={listRef}
                className="space-y-1 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-borderStandard scrollbar-track-transparent"
                style={{ maxHeight: '280px' }}
              >
                {displayItems.map((item, index) => (
                  <div
                    key={`${item.itemType}-${item.relativePath}-${item.extra}-${item.insertText ?? ''}`}
                    onClick={() => handleItemClick(index)}
                    data-selected={index === selectedIndex}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                      index === selectedIndex ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'
                    }`}
                  >
                    <div className="flex-shrink-0 text-text-secondary">
                      <ItemIcon item={item} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate text-text-primary">{item.name}</div>
                      <div className="text-xs truncate text-text-secondary">{item.extra}</div>
                    </div>
                  </div>
                ))}

                {!isLoading && displayItems.length === 0 && (
                  <div className="p-4 text-center text-text-secondary text-sm">
                    {query
                      ? intl.formatMessage(isSlashCommand ? i18n.noCommandsFound : i18n.noItemsFound, {
                          query,
                        })
                      : isSlashCommand
                        ? intl.formatMessage(i18n.noCommandsAvailable)
                        : null}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
);

MentionPopover.displayName = 'MentionPopover';

export default MentionPopover;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CircleHelp, FolderGit2, MessageCircle, Search, Settings } from 'lucide-react';
import { FolderClosed, FolderOpened } from '../icons/Folder';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { motion } from 'framer-motion';
import { useNavigationContext } from './NavigationContext';
import { useConfig } from '../ConfigContext';
import { useNavigationSessions } from '../../hooks/useNavigationSessions';
import {
  NAV_ITEMS,
  SETTINGS_NAV_ITEM,
  getNavItemLabel,
  type NavItem,
} from '../../hooks/useNavigationItems';
import { AppEvents } from '../../constants/events';
import { InlineEditText } from '../common/InlineEditText';
import { SessionIndicators } from '../SessionIndicators';
import EnvironmentBadge from '../GooseSidebar/EnvironmentBadge';
import {
  acpCountSessionsForDir,
  acpListSessions,
  acpRenameSession,
  type SessionListItem,
} from '../../acp/sessions';
import { codex } from '../../codex/client';
import { cn } from '../../utils';
import { groupSessionsByProject, type ProjectGroup } from '../../utils/projectSessions';
import { defineMessages, useIntl } from '../../i18n';

type StreamState = 'idle' | 'loading' | 'streaming' | 'error';

interface SessionStatus {
  streamState: StreamState;
  hasUnreadActivity: boolean;
}

const DOCS_URL = 'https://goose-docs.ai';
const SEARCH_DEBOUNCE_MS = 250;

const i18n = defineMessages({
  projects: {
    id: 'navigationPanel.projects',
    defaultMessage: 'Projects',
  },
  noChats: {
    id: 'navigationPanel.noChats',
    defaultMessage: 'No recent chats',
  },
  untitledSession: {
    id: 'navigationPanel.untitledSession',
    defaultMessage: 'Untitled session',
  },
  search: {
    id: 'navigationPanel.search',
    defaultMessage: 'Search chats',
  },
  noResults: {
    id: 'navigationPanel.noResults',
    defaultMessage: 'No matching chats',
  },
  searching: {
    id: 'navigationPanel.searching',
    defaultMessage: 'Searching...',
  },
  help: {
    id: 'navigationPanel.help',
    defaultMessage: 'Help',
  },
  showMore: {
    id: 'navigationPanel.showMore',
    defaultMessage: 'Show more',
  },
  projectThreads: {
    id: 'navigationPanel.projectThreads',
    defaultMessage: '{count, plural, one {# thread} other {# threads}}',
  },
  projectThreadsCapped: {
    id: 'navigationPanel.projectThreadsCapped',
    defaultMessage: '{count, number}+ threads',
  },
});

const SESSIONS_PER_PROJECT = 5;

const rowClass = (active: boolean) =>
  cn(
    'no-drag flex w-full flex-row items-center gap-2.5 rounded-full px-3 py-2 outline-none',
    'text-sm transition-colors',
    active
      ? 'bg-background-tertiary text-text-primary'
      : 'text-text-primary hover:bg-background-tertiary/60'
  );

interface NavRowProps {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}

const NavRow: React.FC<NavRowProps> = ({ item, active, onClick }) => {
  const intl = useIntl();
  const Icon = item.icon;
  return (
    <button onClick={onClick} className={rowClass(active)}>
      <Icon className="size-[18px] flex-shrink-0" />
      <span className="flex-1 truncate text-left">{getNavItemLabel(item, intl)}</span>
      {item.getTag && <span className="font-mono text-xs text-text-tertiary">{item.getTag()}</span>}
    </button>
  );
};

interface SessionRowProps {
  session: SessionListItem;
  active: boolean;
  status: SessionStatus | undefined;
  onClick: () => void;
  onRenamed: () => void;
}

const SessionRow: React.FC<SessionRowProps> = ({ session, active, status, onClick, onRenamed }) => {
  const intl = useIntl();
  const [isEditing, setIsEditing] = useState(false);
  const isStreaming = status?.streamState === 'streaming';
  const hasError = status?.streamState === 'error';
  const hasUnread = status?.hasUnreadActivity ?? false;

  return (
    <div
      onClick={() => !isEditing && onClick()}
      className={cn(
        'no-drag flex cursor-pointer items-center gap-2 rounded-full py-2 pl-10 pr-3 text-sm',
        'transition-colors',
        active
          ? 'bg-background-tertiary text-text-primary'
          : 'text-text-secondary hover:bg-background-tertiary/60 hover:text-text-primary'
      )}
    >
      <InlineEditText
        value={session.name}
        onSave={async (newName) => {
          await acpRenameSession(session.id, newName);
          window.dispatchEvent(
            new CustomEvent(AppEvents.SESSION_RENAMED, {
              detail: { sessionId: session.id, newName, userInitiated: true },
            })
          );
          onRenamed();
        }}
        placeholder={intl.formatMessage(i18n.untitledSession)}
        disabled={isStreaming}
        singleClickEdit={false}
        className="flex-1 truncate !px-0 !py-0 text-inherit hover:bg-transparent"
        editClassName="!text-sm"
        onEditStart={() => setIsEditing(true)}
        onEditEnd={() => setIsEditing(false)}
      />
      <SessionIndicators isStreaming={isStreaming} hasUnread={hasUnread} hasError={hasError} />
    </div>
  );
};

interface ProjectInfo {
  threadCount: number;
  threadCountCapped: boolean;
  gitRepo: string | null;
}

// Cached for the app's lifetime: thread counts drift a little while the app is
// open, but the hover card is a glance surface and refetching on every hover
// would hammer thread/list.
const projectInfoCache = new Map<string, Promise<ProjectInfo>>();

const fetchProjectInfo = (path: string): Promise<ProjectInfo> => {
  const cached = projectInfoCache.get(path);
  if (cached) return cached;

  const promise = Promise.all([
    acpCountSessionsForDir(path),
    window.electron.getGitRemoteRepo(path).catch(() => null),
  ]).then(([{ count, capped }, gitRepo]) => ({
    threadCount: count,
    threadCountCapped: capped,
    gitRepo,
  }));
  promise.catch(() => projectInfoCache.delete(path));
  projectInfoCache.set(path, promise);
  return promise;
};

const abbreviateHome = (path: string): string => {
  const homeDir = (window.appConfig?.get('GOOSE_HOME_DIR') as string | undefined) ?? '';
  return homeDir && path.startsWith(homeDir) ? `~${path.slice(homeDir.length)}` : path;
};

const ProjectHoverInfo: React.FC<{ group: ProjectGroup }> = ({ group }) => {
  const intl = useIntl();
  const [info, setInfo] = useState<ProjectInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProjectInfo(group.path)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [group.path]);

  return (
    <div className="flex w-72 flex-col text-sm">
      <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
        <FolderClosed className="size-[18px] flex-shrink-0" />
        <span className="truncate text-[15px] font-medium text-text-primary">{group.label}</span>
      </div>
      <div className="flex items-center gap-2.5 px-3 pb-3 text-text-secondary">
        <MessageCircle className="size-[18px] flex-shrink-0" />
        <span>
          {info
            ? intl.formatMessage(
                info.threadCountCapped ? i18n.projectThreadsCapped : i18n.projectThreads,
                { count: info.threadCount }
              )
            : '…'}
        </span>
      </div>
      <div className="border-t border-border-primary" />
      <div className="flex flex-col gap-2 px-3 py-3 text-text-secondary">
        {info?.gitRepo && (
          <div className="flex items-center gap-2.5">
            <FolderGit2 className="size-[18px] flex-shrink-0" />
            <span className="truncate">{info.gitRepo}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <FolderClosed className="size-[18px] flex-shrink-0" />
          <span className="truncate">{abbreviateHome(group.path)}</span>
        </div>
      </div>
    </div>
  );
};

const accountDisplayName = (account: Awaited<ReturnType<typeof codex.accountRead>>['account']) => {
  if (!account) return null;
  if (account.type === 'chatgpt') return account.email.split('@')[0];
  if (account.type === 'apiKey') return 'API key';
  return 'Bedrock';
};

export const Navigation: React.FC<{ className?: string }> = ({ className }) => {
  const intl = useIntl();
  const { isNavExpanded } = useNavigationContext();
  const location = useLocation();
  const { extensionsList } = useConfig();

  const appsExtensionEnabled = !!extensionsList?.find((ext) => ext.name === 'apps')?.enabled;

  const visibleItems = useMemo<NavItem[]>(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.path === '/apps') return appsExtensionEnabled;
        return true;
      }),
    [appsExtensionEnabled]
  );

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  const {
    recentSessionsByProject,
    activeSessionId,
    fetchSessions,
    handleNavClick,
    handleSessionClick,
  } = useNavigationSessions();

  const [sessionStatuses, setSessionStatuses] = useState<Map<string, SessionStatus>>(new Map());
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    codex
      .accountRead()
      .then(({ account }) => {
        if (!cancelled) setAccountName(accountDisplayName(account));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SessionListItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [fullyShownProjects, setFullyShownProjects] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleStatusUpdate = (event: Event) => {
      const { sessionId, streamState } = (event as CustomEvent).detail;
      setSessionStatuses((prev) => {
        const existing = prev.get(sessionId);
        const shouldMarkUnread = existing?.streamState === 'streaming' && streamState === 'idle';
        const next = new Map(prev);
        next.set(sessionId, {
          streamState,
          hasUnreadActivity: existing?.hasUnreadActivity || shouldMarkUnread,
        });
        return next;
      });
    };

    window.addEventListener(AppEvents.SESSION_STATUS_UPDATE, handleStatusUpdate);
    return () => window.removeEventListener(AppEvents.SESSION_STATUS_UPDATE, handleStatusUpdate);
  }, []);

  const clearUnread = useCallback((sessionId: string) => {
    setSessionStatuses((prev) => {
      const status = prev.get(sessionId);
      if (status?.hasUnreadActivity) {
        const next = new Map(prev);
        next.set(sessionId, { ...status, hasUnreadActivity: false });
        return next;
      }
      return prev;
    });
  }, []);

  const navFocusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNavExpanded) {
      fetchSessions();
      requestAnimationFrame(() => navFocusRef.current?.focus());
    }
  }, [isNavExpanded, fetchSessions]);

  const toggleProject = useCallback((path: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Searching hits the backend so it covers the full history, not just the
  // recent sessions the sidebar keeps in memory.
  const keyword = query.trim();
  useEffect(() => {
    if (!keyword) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const { sessions } = await acpListSessions(null, { keyword });
        if (!cancelled) setSearchResults(sessions);
      } catch (error) {
        console.error('Failed to search sessions:', error);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [keyword]);

  const groups = useMemo<ProjectGroup[]>(
    () => (searchResults ? groupSessionsByProject(searchResults) : recentSessionsByProject),
    [recentSessionsByProject, searchResults]
  );

  const openSearch = useCallback(() => {
    setIsSearchOpen((open) => {
      if (open) setQuery('');
      return !open;
    });
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  if (!isNavExpanded) return null;

  return (
    <motion.div
      ref={navFocusRef}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'flex h-full flex-col bg-background-secondary outline-none',
        'border-r border-border-primary',
        className
      )}
    >
      {/* Drag region clearing the window controls. */}
      <div className="h-[52px]" />

      <div className="flex items-center gap-1 pl-5 pr-3 pb-2">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
          iCodex
        </span>
        <EnvironmentBadge />
        <div className="flex-1" />
        <button
          onClick={openSearch}
          className="no-drag rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary"
          aria-label={intl.formatMessage(i18n.search)}
          title={intl.formatMessage(i18n.search)}
        >
          <Search className="size-4" />
        </button>
      </div>

      {isSearchOpen && (
        <div className="px-3 pb-2">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                setIsSearchOpen(false);
              }
            }}
            placeholder={intl.formatMessage(i18n.search)}
            className="no-drag w-full rounded-lg bg-background-tertiary px-2.5 py-1.5 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
      )}

      <div className="flex flex-col gap-px px-2">
        {visibleItems.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            active={isActive(item.path)}
            onClick={() => handleNavClick(item.path)}
          />
        ))}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="px-5 pb-1.5 text-sm text-text-tertiary">
          {intl.formatMessage(i18n.projects)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {isSearching && groups.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-tertiary">
              {intl.formatMessage(i18n.searching)}
            </div>
          ) : groups.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-tertiary">
              {intl.formatMessage(keyword ? i18n.noResults : i18n.noChats)}
            </div>
          ) : (
            groups.map((group) => {
              const isCollapsed = collapsedProjects.has(group.path) && !keyword;
              const showAll = fullyShownProjects.has(group.path) || Boolean(keyword);
              const visibleSessions = showAll
                ? group.sessions
                : group.sessions.slice(0, SESSIONS_PER_PROJECT);
              const hasMore = !showAll && group.sessions.length > visibleSessions.length;
              return (
                <React.Fragment key={group.path}>
                  <Tooltip delayDuration={400}>
                    <TooltipTrigger asChild>
                      <button onClick={() => toggleProject(group.path)} className={rowClass(false)}>
                        {isCollapsed ? (
                          <FolderClosed className="size-[18px] flex-shrink-0" />
                        ) : (
                          <FolderOpened className="size-[18px] flex-shrink-0" />
                        )}
                        <span className="flex-1 truncate text-left">{group.label}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      align="start"
                      sideOffset={10}
                      className="rounded-2xl border border-border-primary bg-background-secondary p-0 text-text-primary shadow-lg"
                      hideArrow
                    >
                      <ProjectHoverInfo group={group} />
                    </TooltipContent>
                  </Tooltip>
                  {!isCollapsed &&
                    visibleSessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        active={session.id === activeSessionId}
                        status={sessionStatuses.get(session.id)}
                        onClick={() => {
                          clearUnread(session.id);
                          handleSessionClick(session.id);
                        }}
                        onRenamed={fetchSessions}
                      />
                    ))}
                  {!isCollapsed && hasMore && (
                    <button
                      onClick={() =>
                        setFullyShownProjects((prev) => new Set(prev).add(group.path))
                      }
                      className="no-drag flex w-full rounded-full py-2 pl-10 pr-3 text-sm text-text-tertiary transition-colors hover:bg-background-tertiary/60 hover:text-text-primary"
                    >
                      {intl.formatMessage(i18n.showMore)}
                    </button>
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border-primary px-3 py-2.5">
        <button
          onClick={() => handleNavClick(SETTINGS_NAV_ITEM.path)}
          title={getNavItemLabel(SETTINGS_NAV_ITEM, intl)}
          className="no-drag flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-[13px] text-text-primary transition-colors hover:bg-background-tertiary/60"
        >
          {accountName ? (
            <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-block-teal text-[10px] font-semibold uppercase text-white">
              {accountName.slice(0, 2)}
            </span>
          ) : (
            <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-background-tertiary">
              <Settings className="size-3.5 text-text-secondary" />
            </span>
          )}
          <span className="truncate">
            {accountName ?? getNavItemLabel(SETTINGS_NAV_ITEM, intl)}
          </span>
        </button>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="no-drag rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary"
          aria-label={intl.formatMessage(i18n.help)}
          title={intl.formatMessage(i18n.help)}
        >
          <CircleHelp className="size-4" />
        </a>
      </div>
    </motion.div>
  );
};

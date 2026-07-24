import { DEFAULT_CHAT_TITLE } from '../contexts/ChatContext';
import { codex } from '../codex/client';
import type { Thread } from '../codex/protocol/v2/Thread';

// Codex can only archive threads that still have a rollout file on disk.
// Stale state-db rows without one fail `thread/archive` forever, so we
// tombstone those ids locally and drop them from list results.
const HIDDEN_THREADS_KEY = 'goose-hidden-threads';

function readHiddenThreadIds(): Set<string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_THREADS_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function hideThread(threadId: string): void {
  const ids = readHiddenThreadIds();
  ids.add(threadId);
  window.localStorage.setItem(HIDDEN_THREADS_KEY, JSON.stringify([...ids]));
}

function isMissingRolloutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('no rollout found');
}

function threadToListItem(thread: Thread): SessionListItem {
  const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
  return {
    id: thread.id,
    name: thread.name || thread.preview.slice(0, 80) || DEFAULT_CHAT_TITLE,
    workingDir: thread.cwd,
    updatedAt: iso(thread.updatedAt),
    messageCount: 0,
    createdAt: iso(thread.createdAt),
    userSetName: Boolean(thread.name),
  };
}

export interface SessionListItem {
  id: string;
  name: string;
  workingDir: string;
  updatedAt: string;
  messageCount: number;
  lastMessageAt?: string;
  createdAt: string;
  archivedAt?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  userSetName?: boolean;
}

export interface SessionListPage {
  sessions: SessionListItem[];
  nextCursor: string | null;
}

export interface SessionListFilter {
  keyword?: string;
}

export async function acpListSessions(
  cursor?: string | null,
  filter?: SessionListFilter
): Promise<SessionListPage> {
  const response = await codex.threadList({
    cursor: cursor ?? null,
    limit: 50,
    searchTerm: filter?.keyword?.trim() || null,
    sortKey: 'updated_at',
  });
  const hidden = readHiddenThreadIds();
  return {
    sessions: response.data.filter((t) => !hidden.has(t.id)).map(threadToListItem),
    nextCursor: response.nextCursor ?? null,
  };
}

export async function acpListRecentSessions(maxSessions: number): Promise<SessionListItem[]> {
  if (maxSessions <= 0) {
    return [];
  }
  const response = await codex.threadList({
    limit: maxSessions,
    sortKey: 'updated_at',
  });
  const hidden = readHiddenThreadIds();
  return response.data.filter((t) => !hidden.has(t.id)).map(threadToListItem);
}

const COUNT_PAGE_SIZE = 100;
const COUNT_MAX = 1000;

/** Count threads whose cwd matches `workingDir`, capped at COUNT_MAX. */
export async function acpCountSessionsForDir(
  workingDir: string
): Promise<{ count: number; capped: boolean }> {
  let count = 0;
  let cursor: string | null = null;
  const hidden = readHiddenThreadIds();
  while (count < COUNT_MAX) {
    const response = await codex.threadList({
      cursor,
      limit: COUNT_PAGE_SIZE,
      cwd: workingDir,
      sortKey: 'updated_at',
      useStateDbOnly: true,
    });
    count += response.data.filter((t) => !hidden.has(t.id)).length;
    cursor = response.nextCursor ?? null;
    if (!cursor) return { count, capped: false };
  }
  return { count: COUNT_MAX, capped: true };
}

export async function acpGetSessionListItem(sessionId: string): Promise<SessionListItem> {
  const { thread } = await codex.threadRead({ threadId: sessionId });
  return threadToListItem(thread);
}

export async function acpArchiveSession(sessionId: string): Promise<void> {
  try {
    await codex.threadArchive(sessionId);
  } catch (error) {
    if (!isMissingRolloutError(error)) throw error;
    hideThread(sessionId);
  }
}

export async function acpRenameSession(sessionId: string, title: string): Promise<void> {
  await codex.threadSetName(sessionId, title);
}

export async function acpForkSession(
  sessionId: string,
  _conversationBefore?: number
): Promise<string> {
  const { thread } = await codex.threadFork(sessionId);
  return thread.id;
}

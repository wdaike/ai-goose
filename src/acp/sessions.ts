import type {
  LoadSessionResponse,
  NewSessionRequest,
  SessionInfo,
} from '@agentclientprotocol/sdk';
import type { GooseExtension } from '../types/goose';
import { getAcpClient } from './acpConnection';
import { DEFAULT_CHAT_TITLE } from '../contexts/ChatContext';
import type { ExtensionLoadResult } from '../types/extensions';
import type { Session } from '../types/session';

interface GooseSessionInfoMeta {
  messageCount?: number;
  createdAt?: string;
  lastMessageAt?: string;
  archivedAt?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  sessionType?: Session['session_type'];
  userSetName?: boolean;
  lastMessageSnippet?: string;
}

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

export interface LoadSessionMeta {
  extensionResults?: ExtensionLoadResult[] | null;
  workingDir?: string;
}

export interface AcpLoadSessionResult {
  sessionInfo: SessionInfo;
  response: LoadSessionResponse;
  meta: LoadSessionMeta;
}

const inFlightSessionLoads = new Map<string, Promise<AcpLoadSessionResult>>();

function parseSessionResponseMeta(rawMeta: unknown): LoadSessionMeta {
  const meta = (rawMeta ?? {}) as LoadSessionMeta;
  return {
    extensionResults: meta.extensionResults,
    workingDir: typeof meta.workingDir === 'string' ? meta.workingDir : undefined,
  };
}

export function parseLoadMeta(response: LoadSessionResponse): LoadSessionMeta {
  return parseSessionResponseMeta(response._meta);
}

function sessionInfoMeta(s: SessionInfo): GooseSessionInfoMeta {
  return (s._meta ?? {}) as GooseSessionInfoMeta;
}

export function sessionInfoToSession(s: SessionInfo, loadMeta: LoadSessionMeta = {}): Session {
  const meta = sessionInfoMeta(s);
  const createdAt = meta.createdAt ?? s.updatedAt ?? '';
  const updatedAt = s.updatedAt ?? createdAt;
  const modelConfig: Session['model_config'] = meta.modelId
    ? {
        model_name: meta.modelId,
        toolshim: false,
      }
    : null;

  return {
    id: String(s.sessionId),
    name: s.title ?? DEFAULT_CHAT_TITLE,
    working_dir: loadMeta.workingDir ?? s.cwd,
    created_at: createdAt,
    updated_at: updatedAt,
    last_message_at: meta.lastMessageAt,
    message_count: meta.messageCount ?? 0,
    extension_data: {},
    archived_at: meta.archivedAt,
    project_id: meta.projectId,
    provider_name: meta.providerId,
    model_config: modelConfig,
    session_type: meta.sessionType,
    user_set_name: meta.userSetName,
    last_message_snippet: meta.lastMessageSnippet,
  };
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

export async function acpLoadSession(sessionId: string): Promise<AcpLoadSessionResult> {
  const pendingLoad = inFlightSessionLoads.get(sessionId);
  if (pendingLoad) {
    return pendingLoad;
  }

  const loadPromise = loadAcpSession(sessionId);
  inFlightSessionLoads.set(sessionId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    if (inFlightSessionLoads.get(sessionId) === loadPromise) {
      inFlightSessionLoads.delete(sessionId);
    }
  }
}

export function isAcpSessionLoadInFlight(sessionId: string): boolean {
  return inFlightSessionLoads.has(sessionId);
}

async function loadAcpSession(sessionId: string): Promise<AcpLoadSessionResult> {
  const client = await getAcpClient();
  const initialSessionInfoResponse = await client.goose.sessionInfo_unstable({ sessionId });
  const initialSessionInfo = initialSessionInfoResponse.session;
  const response = await client.loadSession({
    sessionId,
    cwd: initialSessionInfo.cwd,
    mcpServers: [],
  });
  // Loading can populate missing provider/model metadata.
  const sessionInfoResponse = await client.goose.sessionInfo_unstable({ sessionId });

  return {
    sessionInfo: sessionInfoResponse.session,
    response,
    meta: parseLoadMeta(response),
  };
}

export interface AcpNewSessionResult {
  sessionId: string;
  sessionInfo: SessionInfo;
  meta: LoadSessionMeta;
}

export async function acpNewSession(
  cwd: string,
  gooseExtensions: GooseExtension[]
): Promise<AcpNewSessionResult> {
  const client = await getAcpClient();
  const meta: Record<string, unknown> = { client: 'goose-desktop' };
  if (gooseExtensions.length > 0) {
    meta.enabledExtensions = gooseExtensions;
  }
  const request: NewSessionRequest = { cwd, mcpServers: [], _meta: meta };
  const response = await client.newSession(request);
  const sessionId = String(response.sessionId);
  const sessionInfoResponse = await client.goose.sessionInfo_unstable({ sessionId });

  return {
    sessionId,
    sessionInfo: sessionInfoResponse.session,
    meta: parseSessionResponseMeta(response._meta),
  };
}

export async function acpArchiveSession(sessionId: string): Promise<void> {
  try {
    await codex.threadArchive(sessionId);
  } catch (error) {
    if (!isMissingRolloutError(error)) throw error;
    hideThread(sessionId);
  }
}

export async function acpCloseSession(sessionId: string): Promise<void> {
  const client = await getAcpClient();
  await client.unstable_closeSession({ sessionId });
}

export async function acpRenameSession(sessionId: string, title: string): Promise<void> {
  await codex.threadSetName(sessionId, title);
}

export async function acpUpdateWorkingDir(sessionId: string, workingDir: string): Promise<void> {
  const client = await getAcpClient();
  await client.goose.sessionWorkingDirUpdate_unstable({ sessionId, workingDir });
}

export async function acpTruncateSessionConversation(
  sessionId: string,
  truncateFrom: number
): Promise<void> {
  const client = await getAcpClient();
  await client.goose.sessionConversationTruncate_unstable({ sessionId, truncateFrom });
}

export async function acpForkSession(
  sessionId: string,
  _conversationBefore?: number
): Promise<string> {
  const { thread } = await codex.threadFork(sessionId);
  return thread.id;
}

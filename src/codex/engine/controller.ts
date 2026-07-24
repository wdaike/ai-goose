import { v7 as uuidv7 } from 'uuid';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import { AppEvents } from '../../constants/events';
import { ChatState } from '../../types/chatState';
import type { Session } from '../../types/session';
import type { Message } from '../../types/message';
import { errorMessage } from '../../utils/conversionUtils';
import { acpChatSessionActions, acpChatSessionStore } from '../../acp/chatSessionStore';
import { requestAcpPermission } from '../../acp/permissionRequests';
import type {
  AcpChatSessionController,
  AcpLoadSessionOptions,
  AcpSubmitMessageOptions,
} from '../../acp/chatSessionController';
import { acpReadConfig } from '../../acp/config';
import { codex } from '../client';
import type { AskForApproval } from '../protocol/v2/AskForApproval';
import type { SandboxPolicy } from '../protocol/v2/SandboxPolicy';
import type { Thread } from '../protocol/v2/Thread';
import type { ThreadItem } from '../protocol/v2/ThreadItem';
import type { TurnError } from '../protocol/v2/TurnError';
import type { TurnPlanUpdatedNotification } from '../protocol/v2/TurnPlanUpdatedNotification';
import { mapThreadToMessages, type MappingState } from './mapItems';
import { restoreDynamicToolCalls } from './restoreToolCalls';
import { enforceSkillPolicy } from './skillPolicy';

interface ThreadEntry extends MappingState {
  thread: Thread | null;
  activeTurnWorkGroupId: string | null;
  finish: ((error?: string) => void) | null;
}

interface ServerMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown> & { threadId?: string; itemId?: string };
}

const threads = new Map<string, ThreadEntry>();
const modelOverrides = new Map<string, { model: string | null; effort: string | null }>();
let subscribed = false;

export function getActiveTurnId(threadId: string): string | null {
  return threads.get(threadId)?.activeTurnId ?? null;
}

export function setThreadModelOverride(
  threadId: string,
  model: string | null,
  effort: string | null
): void {
  modelOverrides.set(threadId, { model, effort });
}

function entryFor(threadId: string): ThreadEntry {
  let entry = threads.get(threadId);
  if (!entry) {
    entry = {
      thread: null,
      items: [],
      streams: {},
      createdAt: new Map(),
      approvals: new Map(),
      turnPlans: new Map(),
      activeTurnId: null,
      activeTurnWorkGroupId: null,
      finish: null,
    };
    threads.set(threadId, entry);
  }
  return entry;
}

function publish(threadId: string): void {
  acpChatSessionActions.setMessages(threadId, mapThreadToMessages(entryFor(threadId)));
}

function isoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

export function threadToSession(thread: Thread, messageCount = 0): Session {
  return {
    id: thread.id,
    name: thread.name || thread.preview.slice(0, 80) || thread.id,
    working_dir: thread.cwd,
    created_at: isoFromUnix(thread.createdAt),
    updated_at: isoFromUnix(thread.updatedAt),
    message_count: messageCount,
    extension_data: {},
    user_set_name: Boolean(thread.name),
    last_message_snippet: thread.preview || null,
  };
}

function upsertItem(entry: ThreadEntry, item: ThreadItem): void {
  const index = entry.items.findIndex((existing) => existing.id === item.id);
  if (index === -1) entry.items.push(item);
  else entry.items[index] = item;

  if (item.type === 'userMessage' && entry.activeTurnId) {
    entry.activeTurnWorkGroupId = `work-${item.clientId ?? item.id}`;
    const plan = entry.turnPlans.get(entry.activeTurnId);
    if (plan) plan.workGroupId = entry.activeTurnWorkGroupId;
  }
}

function appendStream(
  entry: ThreadEntry,
  itemId: string,
  key: 'agentText' | 'planText' | 'commandOutput',
  delta: string
): void {
  const stream = entry.streams[itemId] ?? (entry.streams[itemId] = {});
  stream[key] = (stream[key] ?? '') + delta;
}

const APPROVAL_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
]);

function approvalToolName(method: string): string {
  switch (method) {
    case 'item/commandExecution/requestApproval':
      return 'shell';
    case 'item/fileChange/requestApproval':
      return 'edit_file';
    default:
      return 'permission';
  }
}

async function handleApprovalRequest(msg: ServerMessage): Promise<void> {
  const params = msg.params!;
  const threadId = params.threadId as string;
  const itemId = (params.itemId as string) ?? uuidv7();
  const entry = entryFor(threadId);

  const command = params.command as string | undefined;
  const reason = params.reason as string | undefined;
  const toolName = approvalToolName(msg.method!);
  const args: Record<string, unknown> = command ? { command } : { ...params };

  entry.approvals.set(itemId, { itemId, toolName, args, prompt: reason ?? undefined });

  const request: RequestPermissionRequest = {
    sessionId: threadId,
    toolCall: { toolCallId: itemId, title: command ?? toolName, rawInput: args },
    options: [
      { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'allow_always', name: 'Always allow', kind: 'allow_always' },
      { optionId: 'reject_once', name: 'Deny', kind: 'reject_once' },
    ],
  };

  const response = await requestAcpPermission(request);
  const outcome = response.outcome;
  const decision =
    outcome?.outcome === 'selected'
      ? outcome.optionId === 'allow_once'
        ? 'accept'
        : outcome.optionId === 'allow_always'
          ? 'acceptForSession'
          : 'decline'
      : 'cancel';

  window.codex.respond(msg.id!, { decision });
  entry.approvals.delete(itemId);
  acpChatSessionActions.setChatState(
    threadId,
    entry.activeTurnId ? ChatState.Streaming : ChatState.Idle
  );
  publish(threadId);
}

function handleEvent(msg: ServerMessage): void {
  if (msg.id !== undefined && msg.method) {
    if (APPROVAL_METHODS.has(msg.method) && msg.params?.threadId) {
      void handleApprovalRequest(msg);
    } else {
      window.codex.respond(msg.id, {});
    }
    return;
  }

  const params = msg.params;
  const threadId = params?.threadId;
  if (!threadId) return;
  const entry = entryFor(threadId);

  switch (msg.method) {
    case 'thread/started': {
      const thread = params!.thread as Thread;
      entry.thread = thread;
      break;
    }
    case 'turn/started': {
      entry.activeTurnId = (params!.turn as { id: string }).id;
      entry.activeTurnWorkGroupId = null;
      acpChatSessionActions.setChatState(threadId, ChatState.Streaming);
      break;
    }
    case 'turn/completed': {
      const turn = params!.turn as { id: string; error: TurnError | null };
      if (entry.activeTurnId === turn.id) entry.activeTurnId = null;
      entry.activeTurnWorkGroupId = null;
      acpChatSessionActions.setChatState(threadId, ChatState.Idle);
      publish(threadId);
      const finish = entry.finish;
      entry.finish = null;
      finish?.(turn.error?.message);
      break;
    }
    case 'turn/plan/updated': {
      const update = params as unknown as TurnPlanUpdatedNotification;
      const existing = entry.turnPlans.get(update.turnId);
      entry.turnPlans.set(update.turnId, {
        explanation: update.explanation,
        steps: update.plan,
        workGroupId:
          entry.activeTurnWorkGroupId ?? existing?.workGroupId ?? `work-${update.turnId}`,
      });
      publish(threadId);
      break;
    }
    case 'item/started':
    case 'item/completed': {
      const item = params!.item as ThreadItem;
      upsertItem(entry, item);
      if (msg.method === 'item/completed') delete entry.streams[item.id];
      publish(threadId);
      break;
    }
    case 'item/agentMessage/delta':
      appendStream(entry, params!.itemId as string, 'agentText', params!.delta as string);
      publish(threadId);
      break;
    case 'item/plan/delta':
      appendStream(entry, params!.itemId as string, 'planText', params!.delta as string);
      publish(threadId);
      break;
    case 'item/commandExecution/outputDelta':
      appendStream(entry, params!.itemId as string, 'commandOutput', params!.delta as string);
      publish(threadId);
      break;
    case 'item/reasoning/summaryTextDelta': {
      const itemId = params!.itemId as string;
      const summaryIndex = params!.summaryIndex as number;
      const stream = entry.streams[itemId] ?? (entry.streams[itemId] = {});
      const summary = stream.reasoningSummary ?? (stream.reasoningSummary = []);
      summary[summaryIndex] = (summary[summaryIndex] ?? '') + (params!.delta as string);
      publish(threadId);
      break;
    }
  }
}

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  window.codex.onEvent((raw) => handleEvent(raw as ServerMessage));
}

function seedEntry(thread: Thread, items: ThreadItem[]): ThreadEntry {
  const entry = entryFor(thread.id);
  entry.thread = thread;
  entry.items = items;
  return entry;
}

function sessionLoadedEvents(sessionId: string, options: AcpLoadSessionOptions = {}): void {
  window.dispatchEvent(
    new CustomEvent(AppEvents.SESSION_EXTENSIONS_LOADED, { detail: { sessionId } })
  );
  options.onSessionLoaded?.();
}

function applySkillPolicy(cwd: string): Promise<unknown> {
  return enforceSkillPolicy(cwd).catch((error) => {
    console.warn('Failed to enforce skill policy:', errorMessage(error));
  });
}

async function createSession(cwd: string): Promise<Session> {
  ensureSubscribed();
  const [{ thread }] = await Promise.all([codex.threadStart({ cwd }), applySkillPolicy(cwd)]);
  const session = threadToSession(thread);
  seedEntry(thread, []);
  acpChatSessionActions.finishSessionLoad(thread.id, session);
  sessionLoadedEvents(thread.id);
  return session;
}

async function readAndResumeThread(threadId: string) {
  const [read] = await Promise.all([
    codex.threadRead({ threadId, includeTurns: true }),
    codex.threadResume({ threadId }),
  ]);
  return read;
}

async function loadSession(sessionId: string, options: AcpLoadSessionOptions = {}): Promise<void> {
  ensureSubscribed();
  if (threads.get(sessionId)?.thread) {
    sessionLoadedEvents(sessionId, options);
    return;
  }
  acpChatSessionActions.startSessionLoad(sessionId);
  try {
    let read;
    try {
      read = await readAndResumeThread(sessionId);
    } catch (error) {
      if (!/\barchived\b/i.test(errorMessage(error))) throw error;
      await codex.threadUnarchive(sessionId);
      read = await readAndResumeThread(sessionId);
    }
    void applySkillPolicy(read.thread.cwd);
    const items = await restoreDynamicToolCalls(
      read.thread.path,
      read.thread.turns.flatMap((turn) => turn.items)
    );
    seedEntry(read.thread, items);
    publish(sessionId);
    acpChatSessionActions.finishSessionLoad(sessionId, threadToSession(read.thread, items.length));
    sessionLoadedEvents(sessionId, options);
  } catch (error) {
    acpChatSessionActions.failSessionLoad(sessionId, errorMessage(error));
  }
}

interface PermissionPolicies {
  approvalPolicy: AskForApproval;
  sandboxPolicy: SandboxPolicy;
}

const WORKSPACE_WRITE: SandboxPolicy = {
  type: 'workspaceWrite',
  writableRoots: [],
  networkAccess: true,
  excludeTmpdirEnvVar: false,
  excludeSlashTmp: false,
};

const MODE_POLICIES: Record<string, PermissionPolicies> = {
  auto: { approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' } },
  approve: { approvalPolicy: 'untrusted', sandboxPolicy: WORKSPACE_WRITE },
  smart_approve: { approvalPolicy: 'on-request', sandboxPolicy: WORKSPACE_WRITE },
  chat: { approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false } },
};

async function permissionPolicies(): Promise<PermissionPolicies> {
  const mode = (await acpReadConfig('GOOSE_MODE')) as string | null;
  return MODE_POLICIES[mode ?? 'auto'] ?? MODE_POLICIES.auto;
}

async function submitMessage(
  sessionId: string,
  userMessage: Message,
  options: AcpSubmitMessageOptions
): Promise<void> {
  ensureSubscribed();
  const snapshot = acpChatSessionStore.getSnapshot(sessionId);
  if (snapshot?.activePromptAttemptId) return;

  const text = userMessage.content
    .map((content) => (content.type === 'text' ? content.text : ''))
    .filter(Boolean)
    .join('\n');
  if (!text) return;

  const promptAttemptId = uuidv7();
  acpChatSessionActions.startPromptAttempt(sessionId, promptAttemptId);

  const entry = entryFor(sessionId);
  entry.finish = (error?: string) => {
    if (acpChatSessionActions.finishPromptAttemptIfCurrent(sessionId, promptAttemptId)) {
      void options.onFinish(error);
    }
  };

  try {
    const override = modelOverrides.get(sessionId);
    const policies = await permissionPolicies();
    const params = {
      threadId: sessionId,
      input: [{ type: 'text' as const, text, text_elements: [] }],
      ...policies,
      ...(override?.model ? { model: override.model } : {}),
    };
    try {
      await codex.turnStart(params);
    } catch (error) {
      if (!/thread not found/i.test(errorMessage(error))) throw error;
      await codex.threadResume({ threadId: sessionId });
      await codex.turnStart(params);
    }
  } catch (error) {
    entry.finish = null;
    const submitError = 'Submit error: ' + errorMessage(error);
    if (acpChatSessionActions.finishPromptAttemptIfCurrent(sessionId, promptAttemptId)) {
      void options.onFinish(submitError);
    }
  }
}

function stop(sessionId: string): void {
  const entry = threads.get(sessionId);
  if (entry?.activeTurnId) {
    void codex.turnInterrupt({ threadId: sessionId, turnId: entry.activeTurnId });
  }
}

async function updateMessage(
  sessionId: string,
  _messageId: string,
  newContent: string,
  _editType: 'fork' | 'edit' | undefined,
  _options: AcpSubmitMessageOptions
): Promise<void> {
  const { thread } = await codex.threadFork(sessionId);
  window.dispatchEvent(
    new CustomEvent(AppEvents.SESSION_FORKED, {
      detail: { newSessionId: thread.id, shouldStartAgent: true, editedMessage: newContent },
    })
  );
}

export const codexChatSessionController: AcpChatSessionController = {
  createSession,
  loadSession,
  restoreSession: (sessionId: string) => loadSession(sessionId),
  submitMessage,
  stop,
  updateMessage,
};

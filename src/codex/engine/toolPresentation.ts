import type {
  ContentBlock,
  NotificationEvent,
  ToolResponseMessageContent,
} from '../../types/message';

export const SUBAGENT_LOG_PREFIX = '[subagent:';

export interface Progress {
  progress: number;
  progressToken: string;
  total?: number;
  message?: string;
}

export interface SubagentToolRequestData {
  type: 'subagent_tool_request';
  subagent_id: string;
  tool_call: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface SubagentLogEntry {
  toolName: string;
  extensionName?: string;
  detail?: string;
}

interface UiMeta {
  ui?: {
    resourceUri?: string;
  };
  subagent_session_id?: string;
}

export interface ToolResultValue {
  content: ContentBlock[];
  structuredContent?: unknown;
  isError: boolean;
  _meta?: UiMeta;
}

interface ToolResultWithMeta {
  status?: string;
  value?: ToolResultValue & { _meta?: UiMeta };
}

interface NotificationMessage {
  method?: string;
  params?: Record<string, unknown>;
}

const notificationMessage = (notification: NotificationEvent): NotificationMessage =>
  notification.message as NotificationMessage;

export const isSubagentToolRequestData = (data: unknown): data is SubagentToolRequestData => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const record = data as Record<string, unknown>;
  if (record.type !== 'subagent_tool_request' || typeof record.subagent_id !== 'string') {
    return false;
  }
  if (!record.tool_call || typeof record.tool_call !== 'object') {
    return false;
  }
  return typeof (record.tool_call as Record<string, unknown>).name === 'string';
};

export const splitQualifiedToolName = (
  toolCallName: string
): { extensionName: string | null; toolName: string } => {
  const lastIndex = toolCallName.lastIndexOf('__');
  if (lastIndex === -1) {
    return { extensionName: null, toolName: toolCallName };
  }
  const extensionName = toolCallName.substring(0, lastIndex);
  return {
    extensionName: extensionName || null,
    toolName: toolCallName.substring(lastIndex + 2),
  };
};

export const getToolName = (toolCallName: string): string =>
  splitQualifiedToolName(toolCallName).toolName;

export const getExtensionTooltip = (toolCallName: string): string | null => {
  const { extensionName } = splitQualifiedToolName(toolCallName);
  return extensionName ? `${extensionName} extension` : null;
};

export const formatSubagentToolCall = (data: SubagentToolRequestData): string => {
  const shortId = data.subagent_id.split('_').pop() || data.subagent_id;
  const { extensionName, toolName } = splitQualifiedToolName(data.tool_call.name);
  const label = toolName || 'unknown';
  return extensionName
    ? `${SUBAGENT_LOG_PREFIX}${shortId}] ${label} | ${extensionName}`
    : `${SUBAGENT_LOG_PREFIX}${shortId}] ${label}`;
};

export const logToString = (logMessage: NotificationEvent): string => {
  const params = notificationMessage(logMessage).params ?? {};
  const data = params.data;

  if (isSubagentToolRequestData(data)) {
    return formatSubagentToolCall(data);
  }

  if (data && typeof data === 'object' && 'output' in data && 'stream' in data) {
    const shell = data as { stream: unknown; output: unknown };
    return `[${shell.stream}] ${shell.output}`;
  }

  return typeof data === 'string' ? data : JSON.stringify(data);
};

export const notificationToProgress = (notification: NotificationEvent): Progress =>
  notificationMessage(notification).params as unknown as Progress;

export const parseSubagentLog = (log: string): SubagentLogEntry | null => {
  const match = log.match(/^\[subagent:(\w+)\]\s*([\s\S]*)/);
  if (!match) {
    return null;
  }
  const [firstLine, ...detailLines] = match[2].split('\n');
  const [name, extension] = firstLine.split(' | ');
  return {
    toolName: name?.trim() || firstLine,
    extensionName: extension?.trim() || undefined,
    detail: detailLines.length > 0 ? detailLines.join('\n') : undefined,
  };
};

export const countSubagentLogs = (logs: string[]): number =>
  logs.filter((log) => log.startsWith(SUBAGENT_LOG_PREFIX)).length;

export const getSubagentSessionId = (
  toolResponse?: ToolResponseMessageContent,
  notifications?: NotificationEvent[]
): string | null => {
  const result = toolResponse?.toolResult as ToolResultWithMeta | undefined;
  const sessionId =
    result?.status === 'success' ? result?.value?._meta?.subagent_session_id : undefined;
  if (typeof sessionId === 'string') return sessionId;

  // Delegate cancelled mid-stream never produces a result, so recover the id from its notifications
  for (const notification of notifications ?? []) {
    const message = notificationMessage(notification);
    if (message.method !== 'notifications/message') continue;
    const data = message.params?.data;
    if (!data || typeof data !== 'object') continue;
    const record = data as Record<string, unknown>;
    if (record.type === 'subagent_tool_request' && typeof record.subagent_id === 'string') {
      return record.subagent_id;
    }
  }

  return null;
};

export const getToolResultContent = (toolResult: Record<string, unknown>): ContentBlock[] => {
  if (toolResult.status !== 'success') {
    return [];
  }
  const value = toolResult.value as ToolResultValue;
  return value.content.filter((item) => {
    const audience = (item as { annotations?: { audience?: string[] } }).annotations?.audience;
    return !audience || audience.includes('user');
  });
};

import { ToolIconWithStatus, ToolCallStatus } from './ToolCallStatusIndicator';
import { getToolCallIcon } from '../../utils/toolIconMapping';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { ToolCallArguments, ToolCallArgumentValue } from './ToolCallArguments';
import {
  ToolRequestMessageContent,
  ToolResponseMessageContent,
  NotificationEvent,
  ToolConfirmationData,
} from '../../types/message';
import { cn, snakeToTitleCase } from '../../utils';
import { LoadingStatus } from '../ui/Dot';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { TooltipWrapper } from '../settings/providers/subcomponents/buttons/TooltipWrapper';
import type { ContentBlock } from '../../types/message';
import { useAppSetting } from '../../hooks/useAppSetting';

import FileChangeCard, { getStructuredFileChanges } from './FileChangeCard';
import ToolApprovalButtons from './ToolApprovalButtons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Terminal } from '../icons/toolcalls';
import { defineMessages, useIntl } from '../../i18n';
import {
  countSubagentLogs,
  getExtensionTooltip,
  getSubagentSessionId,
  getToolName,
  getToolResultContent,
  logToString,
  notificationToProgress,
  parseSubagentLog,
  type Progress,
} from '../../codex/engine/toolPresentation';

const i18n = defineMessages({
  viewSubagentSession: {
    id: 'toolCallWithResponse.viewSubagentSession',
    defaultMessage: 'View subagent session',
  },
  toolDetails: {
    id: 'toolCallWithResponse.toolDetails',
    defaultMessage: 'Tool Details',
  },
  output: {
    id: 'toolCallWithResponse.output',
    defaultMessage: 'Output',
  },
  toolResultAlt: {
    id: 'toolCallWithResponse.toolResultAlt',
    defaultMessage: 'Tool result',
  },
  activityCount: {
    id: 'toolCallWithResponse.activityCount',
    defaultMessage: 'Activity ({count})',
  },
  logs: {
    id: 'toolCallWithResponse.logs',
    defaultMessage: 'Logs',
  },
  loadingSpinner: {
    id: 'toolCallWithResponse.loadingSpinner',
    defaultMessage: 'Loading spinner',
  },
});

interface ToolCallWithResponseProps {
  sessionId?: string;
  isCancelledMessage: boolean;
  toolRequest: ToolRequestMessageContent;
  toolResponse?: ToolResponseMessageContent;
  notifications?: NotificationEvent[];
  isStreamingMessage?: boolean;
  isPendingApproval: boolean;
  append?: (value: string) => void;
  confirmationContent?: ToolConfirmationData;
  isApprovalClicked?: boolean;
}

function ShellCommandCard({
  command,
  isCancelled,
  toolResponse,
}: {
  command: unknown;
  isCancelled: boolean;
  toolResponse?: ToolResponseMessageContent;
}) {
  const result = toolResponse?.toolResult as Record<string, unknown> | undefined;
  const output =
    result?.status === 'success'
      ? getToolResultContent(result)
          .flatMap((item) =>
            'text' in item && typeof item.text === 'string' ? [item.text.trimEnd()] : []
          )
          .filter(Boolean)
          .join('\n')
      : result?.status === 'error' && typeof result.error === 'string'
        ? result.error
        : '';

  const commandText = typeof command === 'string' ? command : JSON.stringify(command);
  const isError = result?.status === 'error';
  const [isOpen, setIsOpen] = useState(isError);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full overflow-hidden rounded-xl border border-border-primary bg-background-secondary/70 text-text-secondary"
    >
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-background-secondary">
        <Terminal className="h-4 w-4 shrink-0 text-text-tertiary" />
        <span className="shrink-0 text-sm font-medium">Shell</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-tertiary">
          {commandText}
        </span>
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-text-tertiary transition-transform',
            isOpen && 'rotate-90'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-80 overflow-auto border-t border-border-primary px-3 pt-3 pb-5 font-mono text-xs leading-5">
          {!isCancelled && output ? (
            <pre className="whitespace-pre-wrap break-words font-mono">{output}</pre>
          ) : (
            <span className="text-text-tertiary">No output</span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ToolCallWithResponse({
  sessionId,
  isCancelledMessage,
  toolRequest,
  toolResponse,
  notifications,
  isStreamingMessage,
  isPendingApproval,
  confirmationContent,
  isApprovalClicked,
}: ToolCallWithResponseProps) {
  // Handle both the wrapped ToolResult format and the unwrapped format
  // The server serializes ToolResult<T> as { status: "success", value: T } or { status: "error", error: string }
  const toolCallData = toolRequest.toolCall as Record<string, unknown>;
  const toolCall =
    toolCallData?.status === 'success'
      ? (toolCallData.value as { name: string; arguments: Record<string, unknown> })
      : (toolCallData as { name: string; arguments: Record<string, unknown> });

  if (!toolCall || !toolCall.name) {
    return null;
  }


  const showInlineApproval = isPendingApproval && confirmationContent && sessionId;

  const structuredFileChanges = getStructuredFileChanges(toolCall);
  if (structuredFileChanges && !showInlineApproval) {
    return <FileChangeCard changes={structuredFileChanges} />;
  }

  if (getToolName(toolCall.name) === 'shell' && !showInlineApproval) {
    return (
      <ShellCommandCard
        command={toolCall.arguments?.command}
        isCancelled={isCancelledMessage}
        toolResponse={toolResponse}
      />
    );
  }

  return (
    <>
      <div
        className={cn(
          'w-full text-sm font-sans rounded-lg overflow-hidden border',
          showInlineApproval ? 'border-amber-500/50 bg-amber-50/5' : 'border-border-primary'
        )}
      >
        <ToolCallView
          {...{
            isCancelledMessage,
            toolCall,
            toolResponse,
            notifications,
            isStreamingMessage,
          }}
        />
        {/* Inline approval UI */}
        {showInlineApproval && (
          <div className="border-t border-amber-500/30">
            {confirmationContent.prompt && (
              <div className="px-4 py-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50/10">
                {confirmationContent.prompt}
              </div>
            )}
            <div className="px-4 pb-2">
              <ToolApprovalButtons
                data={{
                  id: confirmationContent.id,
                  toolName: confirmationContent.toolName,
                  prompt: confirmationContent.prompt ?? undefined,
                  sessionId,
                  isClicked: isApprovalClicked,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

interface ToolCallExpandableProps {
  label: string | React.ReactNode;
  isStartExpanded?: boolean;
  isForceExpand?: boolean;
  children: React.ReactNode;
  className?: string;
}

function ToolCallExpandable({
  label,
  isStartExpanded = false,
  isForceExpand,
  children,
  className = '',
}: ToolCallExpandableProps) {
  const [isExpandedState, setIsExpanded] = React.useState<boolean | null>(null);
  const isExpanded = isExpandedState === null ? isStartExpanded : isExpandedState;
  const toggleExpand = () => setIsExpanded(!isExpanded);
  React.useEffect(() => {
    if (isForceExpand) setIsExpanded(true);
  }, [isForceExpand]);

  return (
    <div className={className}>
      <Button
        onClick={toggleExpand}
        className="group w-full flex justify-between items-center pr-2 transition-colors rounded-none"
        variant="ghost"
      >
        <span className="flex items-center font-sans text-sm truncate flex-1 min-w-0">{label}</span>
        <ChevronRight
          className={cn(
            'group-hover:opacity-100 transition-transform opacity-70',
            isExpanded && 'rotate-90'
          )}
        />
      </Button>
      {isExpanded && <div>{children}</div>}
    </div>
  );
}

interface ToolCallViewProps {
  isCancelledMessage: boolean;
  toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResponse?: ToolResponseMessageContent;
  notifications?: NotificationEvent[];
  isStreamingMessage?: boolean;
}

function ToolCallView({
  isCancelledMessage,
  toolCall,
  toolResponse,
  notifications,
  isStreamingMessage = false,
}: ToolCallViewProps) {
  const intl = useIntl();
  const responseStyle = useAppSetting('responseStyle', 'concise');
  const isExpandToolDetails = responseStyle === 'detailed';

  const isToolDetails = toolCall?.arguments && Object.entries(toolCall.arguments).length > 0;

  // Check if streaming has finished but no tool response was received
  // This is a workaround for cases where the backend doesn't send tool responses
  const isStreamingComplete = !isStreamingMessage;
  const shouldShowAsComplete = isStreamingComplete && !toolResponse;

  const loadingStatus: LoadingStatus = !toolResponse
    ? shouldShowAsComplete
      ? 'success'
      : 'loading'
    : (toolResponse.toolResult as Record<string, unknown>).status === 'error'
      ? 'error'
      : 'success';

  // Tool call timing tracking
  const [startTime, setStartTime] = useState<number | null>(null);

  // Track when tool call starts (when there's no response yet)
  useEffect(() => {
    if (!toolResponse && startTime === null) {
      setStartTime(Date.now());
    }
  }, [toolResponse, startTime]);

  const toolResults =
    loadingStatus === 'success' && toolResponse?.toolResult
      ? getToolResultContent(toolResponse.toolResult)
      : [];

  const logs = notifications
    ?.filter((notification) => {
      const message = notification.message as { method?: string };
      return message.method === 'notifications/message';
    })
    .map(logToString);

  const progress = notifications
    ?.filter((notification) => {
      const message = notification.message as { method?: string };
      return message.method === 'notifications/progress';
    })
    .map(notificationToProgress)
    .reduce((map, item) => {
      const key = item.progressToken;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
      return map;
    }, new Map<string, Progress[]>());

  const progressEntries = [...(progress?.values() || [])].map(
    (entries) => entries.sort((a, b) => b.progress - a.progress)[0]
  );

  const isRenderingProgress =
    loadingStatus === 'loading' && (progressEntries.length > 0 || (logs || []).length > 0);

  // Function to create a descriptive representation of what the tool is doing
  const getToolDescription = (): string | null => {
    const args = (toolCall.arguments ?? {}) as Record<string, ToolCallArgumentValue>;
    const toolName = getToolName(toolCall.name);

    const getStringValue = (value: ToolCallArgumentValue): string => {
      return typeof value === 'string' ? value : JSON.stringify(value);
    };

    // Generate descriptive text based on tool type
    switch (toolName) {
      case 'text_editor':
        if (args.command === 'write' && args.path) {
          return `writing ${getStringValue(args.path)}`;
        }
        if (args.command === 'view' && args.path) {
          return `reading ${getStringValue(args.path)}`;
        }
        if (args.command === 'str_replace' && args.path) {
          return `editing ${getStringValue(args.path)}`;
        }
        if (args.command && args.path) {
          return `${getStringValue(args.command)} ${getStringValue(args.path)}`;
        }
        break;

      case 'shell':
        if (args.command) {
          return `running ${getStringValue(args.command)}`;
        }
        break;

      case 'list_files': {
        const actions = Array.isArray(args.command_actions) ? args.command_actions : [];
        const path = actions.find(
          (action): action is { type: string; path?: string | null } =>
            typeof action === 'object' &&
            action !== null &&
            'type' in action &&
            action.type === 'list_files'
        )?.path;
        const cwd = typeof args.cwd === 'string' ? args.cwd : undefined;
        const target = !path || path === '.' ? cwd : path;
        if (target) {
          const normalized = target.replace(/[\\/]+$/, '');
          const name = normalized.split(/[\\/]/).pop() || target;
          return `listing files in ${name}`;
        }
        return 'listing files';
      }

      case 'read_files': {
        const actions = Array.isArray(args.command_actions) ? args.command_actions : [];
        const names = actions.flatMap((action) => {
          if (typeof action !== 'object' || action === null || !('type' in action)) return [];
          if (action.type !== 'read' || !('name' in action) || typeof action.name !== 'string') {
            return [];
          }
          return [action.name];
        });
        if (names.length === 1) return `reading ${names[0]}`;
        if (names.length > 1) return `reading ${names.length} files`;
        return 'reading files';
      }

      case 'search_files': {
        const actions = Array.isArray(args.command_actions) ? args.command_actions : [];
        const action = actions.find(
          (candidate): candidate is { type: string; query?: string | null; path?: string | null } =>
            typeof candidate === 'object' &&
            candidate !== null &&
            'type' in candidate &&
            candidate.type === 'search'
        );
        if (action?.query && action.path) {
          return `searching for "${action.query}" in ${action.path}`;
        }
        if (action?.query) return `searching for "${action.query}"`;
        if (action?.path) return `searching files in ${action.path}`;
        return 'searching files';
      }

      case 'search':
        if (args.name) {
          return `searching for "${getStringValue(args.name)}"`;
        }
        if (args.mimeType) {
          return `searching for ${getStringValue(args.mimeType)} files`;
        }
        break;

      case 'read': {
        if (args.uri) {
          const uri = getStringValue(args.uri);
          const fileId = uri.replace('gdrive:///', '');
          return `reading file ${fileId}`;
        }
        if (args.url) {
          return `reading ${getStringValue(args.url)}`;
        }
        break;
      }

      case 'create_file':
        if (args.name) {
          return `creating ${getStringValue(args.name)}`;
        }
        break;

      case 'update_file':
        if (args.fileId) {
          return `updating file ${getStringValue(args.fileId)}`;
        }
        break;

      case 'sheets_tool': {
        if (args.operation && args.spreadsheetId) {
          const operation = getStringValue(args.operation);
          const sheetId = getStringValue(args.spreadsheetId);
          return `${operation} in sheet ${sheetId}`;
        }
        break;
      }

      case 'docs_tool': {
        if (args.operation && args.documentId) {
          const operation = getStringValue(args.operation);
          const docId = getStringValue(args.documentId);
          return `${operation} in document ${docId}`;
        }
        break;
      }

      case 'web_scrape':
        if (args.url) {
          return `scraping ${getStringValue(args.url)}`;
        }
        break;

      case 'remember_memory':
        if (args.category && args.data) {
          return `storing ${getStringValue(args.category)}: ${getStringValue(args.data)}`;
        }
        break;

      case 'retrieve_memories':
        if (args.category) {
          return `retrieving ${getStringValue(args.category)} memories`;
        }
        break;

      case 'screen_capture':
        if (args.window_title) {
          return `capturing window "${getStringValue(args.window_title)}"`;
        }
        return `capturing screen`;

      case 'automation_script':
        if (args.language) {
          return `running ${getStringValue(args.language)} script`;
        }
        break;

      case 'delegate': {
        if (args.instructions) {
          const instr = getStringValue(args.instructions);
          const truncated = instr.length > 80 ? instr.substring(0, 80) + '…' : instr;
          return `delegating: ${truncated}`;
        }
        if (args.source) {
          return `delegating to ${getStringValue(args.source)}`;
        }
        return 'delegating task';
      }

      case 'load': {
        if (args.source) {
          return `loading ${getStringValue(args.source)}`;
        }
        return 'loading source';
      }

      case 'final_output':
        return 'final output';

      case 'computer_control':
        return `poking around...`;

      default: {
        // Generic fallback for unknown tools: ToolName + CompactArguments
        // This ensures any MCP tool works without explicit handling
        const toolDisplayName = snakeToTitleCase(toolName);
        const entries = Object.entries(args);

        if (entries.length === 0) {
          return `${toolDisplayName}`;
        }

        // For a single parameter, show key and truncated value
        if (entries.length === 1) {
          const [key, value] = entries[0];
          const stringValue = getStringValue(value);
          return `${toolDisplayName} ${key}: ${stringValue}`;
        }

        // For multiple parameters, show tool name and keys
        const keys = entries.map(([key]) => key).join(', ');
        return `${toolDisplayName} ${keys}`;
      }
    }

    return null;
  };

  // Get extension tooltip for the current tool
  const extensionTooltip = getExtensionTooltip(toolCall.name);

  // Extract tool label content to avoid duplication
  const getToolLabelContent = () => {
    const description = getToolDescription();
    if (description) {
      return description;
    }
    // Fallback tool name formatting
    return snakeToTitleCase(getToolName(toolCall.name));
  };
  // Map LoadingStatus to ToolCallStatus
  const getToolCallStatus = (loadingStatus: LoadingStatus): ToolCallStatus => {
    switch (loadingStatus) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'loading':
        return 'loading';
      default:
        return 'pending';
    }
  };

  const toolCallStatus = getToolCallStatus(loadingStatus);

  const toolLabel = (
    <span
      className={cn(
        'flex items-center gap-2 min-w-0',
        extensionTooltip && 'cursor-pointer hover:opacity-80'
      )}
    >
      <ToolIconWithStatus ToolIcon={getToolCallIcon(toolCall.name)} status={toolCallStatus} />
      <span className="truncate flex-1 min-w-0">{getToolLabelContent()}</span>
    </span>
  );
  return (
    <ToolCallExpandable
      isStartExpanded={isRenderingProgress || isExpandToolDetails}
      isForceExpand={false}
      label={
        extensionTooltip ? (
          <TooltipWrapper tooltipContent={extensionTooltip} side="top" align="start">
            {toolLabel}
          </TooltipWrapper>
        ) : (
          toolLabel
        )
      }
    >
      {(() => {
        if (isToolDetails) {
          return (
            <div className="border-t border-border-primary">
              <ToolDetailsView toolCall={toolCall} isStartExpanded={isExpandToolDetails} />
            </div>
          );
        }

        return null;
      })()}

      {logs && logs.length > 0 && (
        <div className="border-t border-border-primary">
          <ToolLogsView
            logs={logs}
            working={loadingStatus === 'loading'}
            isStartExpanded={loadingStatus === 'loading' || isExpandToolDetails}
          />
        </div>
      )}

      {toolResults.length === 0 &&
        progressEntries.length > 0 &&
        progressEntries.map((entry, index) => (
          <div className="p-3 border-t border-border-primary" key={index}>
            <ProgressBar progress={entry.progress} total={entry.total} message={entry.message} />
          </div>
        ))}

      {/* Tool Output */}
      {!isCancelledMessage && (
        <>
          {toolResults.map((result, index) => (
            <div key={index} className={cn('border-t border-border-primary')}>
              <ToolResultView
                toolCall={toolCall}
                result={result}
                isStartExpanded={isExpandToolDetails}
              />
            </div>
          ))}
        </>
      )}

      {(() => {
        if (loadingStatus === 'loading') return null;
        const subagentSessionId = getSubagentSessionId(toolResponse, notifications);
        if (!subagentSessionId) return null;
        return (
          <div className="border-t border-border-primary">
            <button
              onClick={() => {
                window.electron.createChatWindow({
                  resumeSessionId: subagentSessionId,
                  viewType: 'pair',
                });
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-background-secondary transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              <span>{intl.formatMessage(i18n.viewSubagentSession)}</span>
            </button>
          </div>
        );
      })()}
    </ToolCallExpandable>
  );
}

interface ToolDetailsViewProps {
  toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  };
  isStartExpanded: boolean;
}

function ToolDetailsView({ toolCall, isStartExpanded }: ToolDetailsViewProps) {
  const intl = useIntl();
  return (
    <ToolCallExpandable
      label={<span className="pl-4 font-sans text-sm">{intl.formatMessage(i18n.toolDetails)}</span>}
      isStartExpanded={isStartExpanded}
    >
      <div className="pr-4 pl-8">
        {toolCall.arguments && (
          <ToolCallArguments args={toolCall.arguments as Record<string, ToolCallArgumentValue>} />
        )}
      </div>
    </ToolCallExpandable>
  );
}

interface ToolResultViewProps {
  toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  };
  result: ContentBlock;
  isStartExpanded: boolean;
}

function ToolResultView({ result, isStartExpanded }: ToolResultViewProps) {
  const intl = useIntl();
  const hasText = (c: ContentBlock): c is ContentBlock & { text: string } =>
    'text' in c && typeof (c as Record<string, unknown>).text === 'string';

  const hasImage = (c: ContentBlock): c is ContentBlock & { data: string; mimeType: string } => {
    if (!('data' in c && 'mimeType' in c)) return false;
    const mimeType = (c as Record<string, unknown>).mimeType;
    return typeof mimeType === 'string' && mimeType.startsWith('image');
  };

  const hasResource = (c: ContentBlock): c is ContentBlock & { resource: unknown } =>
    'resource' in c;

  return (
    <ToolCallExpandable
      label={<span className="pl-4 py-1 font-sans text-sm">{intl.formatMessage(i18n.output)}</span>}
      isStartExpanded={isStartExpanded}
    >
      <div className="pl-4 pr-4 py-4">
        {hasText(result) && (
          <pre className="font-mono text-xs whitespace-pre-wrap max-w-full overflow-x-auto">
            {result.text.trim()}
          </pre>
        )}
        {hasImage(result) && (
          <img
            src={`data:${result.mimeType};base64,${result.data}`}
            alt={intl.formatMessage(i18n.toolResultAlt)}
            className="max-w-full h-auto rounded-md my-2"
            onError={(e) => {
              console.error('Failed to load image');
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        {hasResource(result) && (
          <pre className="font-sans text-sm">{JSON.stringify(result, null, 2)}</pre>
        )}
      </div>
    </ToolCallExpandable>
  );
}

function SubagentLogEntry({ log }: { log: string }) {
  const entry = parseSubagentLog(log);
  if (!entry) {
    return <span className="font-sans text-sm text-textSubtle">{log}</span>;
  }

  return (
    <div className="font-sans text-sm text-textSubtle">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
        <span className="font-medium text-text-secondary">{entry.toolName}</span>
        {entry.extensionName && (
          <span className="text-textSubtle opacity-60">· {entry.extensionName}</span>
        )}
      </span>
      {entry.detail && (
        <pre className="ml-3 mt-0.5 text-xs text-textSubtle whitespace-pre-wrap">{entry.detail}</pre>
      )}
    </div>
  );
}

function ToolLogsView({
  logs,
  working,
  isStartExpanded,
}: {
  logs: string[];
  working: boolean;
  isStartExpanded?: boolean;
}) {
  const intl = useIntl();
  const boxRef = useRef<HTMLDivElement>(null);

  // Whenever logs update, jump to the newest entry
  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [logs.length]);
  // normally we do not want to put .length on an array in react deps:
  //
  // if the objects inside the array change but length doesn't change you want updates
  //
  // in this case, this is array of strings which once added do not change so this cuts
  // down on the possibility of unwanted runs

  const subagentLogCount = countSubagentLogs(logs);
  const labelText =
    subagentLogCount > 0
      ? intl.formatMessage(i18n.activityCount, { count: subagentLogCount })
      : intl.formatMessage(i18n.logs);

  return (
    <ToolCallExpandable
      label={
        <span className="pl-4 py-1 font-sans text-sm flex items-center">
          <span>{labelText}</span>
          {working && (
            <div className="mx-2 inline-block">
              <span
                className="inline-block animate-spin rounded-full border-2 border-t-transparent border-current"
                style={{ width: 8, height: 8 }}
                role="status"
                aria-label={intl.formatMessage(i18n.loadingSpinner)}
              />
            </div>
          )}
        </span>
      }
      isStartExpanded={isStartExpanded}
    >
      <div
        ref={boxRef}
        className={`flex flex-col items-start space-y-2 overflow-y-auto p-4 ${working ? 'max-h-[4rem]' : 'max-h-[20rem]'}`}
      >
        {logs.map((log, i) => (
          <SubagentLogEntry key={i} log={log} />
        ))}
      </div>
    </ToolCallExpandable>
  );
}

const ProgressBar = ({ progress, total, message }: Omit<Progress, 'progressToken'>) => {
  const isDeterminate = typeof total === 'number';
  const percent = isDeterminate ? Math.min((progress / total!) * 100, 100) : 0;

  return (
    <div className="w-full space-y-2">
      {message && <div className="font-sans text-sm text-textSubtle">{message}</div>}

      <div className="w-full bg-background-subtle rounded-full h-4 overflow-hidden relative">
        {isDeterminate ? (
          <div
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="absolute inset-0 animate-indeterminate bg-primary" />
        )}
      </div>
    </div>
  );
};

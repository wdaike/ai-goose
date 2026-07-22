/**
 * ProgressiveMessageList Component
 *
 * A performance-optimized message list that renders messages progressively
 * to prevent UI blocking when loading long chat sessions. This component
 * renders messages in batches with a loading indicator, maintaining full
 * compatibility with the search functionality.
 *
 * Key Features:
 * - Progressive rendering in configurable batches
 * - Loading indicator during batch processing
 * - Maintains search functionality compatibility
 * - Smooth user experience with responsive UI
 * - Configurable batch size and delay
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defineMessages, useIntl } from '../i18n';
import GooseMessage from './GooseMessage';
import UserMessage from './UserMessage';
import {
  SystemNotificationInline,
  getInlineSystemNotification,
} from './context_management/SystemNotificationInline';
import {
  CreditsExhaustedNotification,
  getCreditsExhaustedNotification,
} from './context_management/CreditsExhaustedNotification';
import {
  getPendingToolConfirmationIds,
  getPlanContent,
  getToolRequests,
  getToolResponses,
  type Message,
  type NotificationEvent,
  type SystemNotificationContent,
} from '../types/message';
import LoadingGoose from './LoadingGoose';
import { ChatType } from '../types/chat';
import {
  getWorkGroupEntries,
  identifyToolCallGroups,
  identifyWorkGroups,
} from '../utils/toolCallChaining';
import { getModelDisplayName } from './settings/models/predefinedModelsUtils';
import ToolCallGroup from './ToolCallGroup';
import WorkToolActivity from './WorkToolActivity';

const i18n = defineMessages({
  loadingMessages: {
    id: 'progressiveMessageList.loadingMessages',
    defaultMessage: 'Loading messages... ({renderedCount}/{totalCount})',
  },
  searchHint: {
    id: 'progressiveMessageList.searchHint',
    defaultMessage: 'Press Cmd/Ctrl+F to load all messages immediately for search',
  },
  modelChanged: {
    id: 'progressiveMessageList.modelChanged',
    defaultMessage: 'Model changed: {previousModel} → {currentModel}',
  },
  workedFor: {
    id: 'progressiveMessageList.workedFor',
    defaultMessage: 'Worked for {duration}',
  },
  working: {
    id: 'progressiveMessageList.working',
    defaultMessage: 'Working…',
  },
});

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function getToolCallGroupDuration(messages: Message[], group: number[]): number {
  const firstMessage = messages[group[0]];
  const lastMessageIndex = group[group.length - 1];
  const requestIds = new Set(
    group.flatMap((messageIndex) =>
      getToolRequests(messages[messageIndex]).map((request) => request.id)
    )
  );
  let completedAt = messages[lastMessageIndex].created;

  for (let i = lastMessageIndex + 1; i < messages.length; i++) {
    const message = messages[i];
    const responses = getToolResponses(message);

    if (responses.some((response) => requestIds.has(response.id))) {
      completedAt = Math.max(completedAt, message.created);
    }

    if (responses.length === 0) {
      if (message.role === 'assistant') {
        completedAt = Math.max(completedAt, message.created);
      }
      break;
    }
  }

  return Math.max(1, Math.round(completedAt - firstMessage.created));
}

function getWorkGroupDuration(messages: Message[], group: number[]): number {
  const firstMessage = messages[group[0]];
  const lastMessageIndex = group[group.length - 1];
  let completedAt = messages[lastMessageIndex].created;

  for (let i = lastMessageIndex + 1; i < messages.length; i++) {
    const message = messages[i];
    if (getToolResponses(message).length > 0) {
      completedAt = Math.max(completedAt, message.created);
      continue;
    }
    if (message.role === 'assistant') {
      completedAt = Math.max(completedAt, message.created);
    }
    break;
  }

  return Math.max(1, Math.round(completedAt - firstMessage.created));
}

interface ProgressiveMessageListProps {
  messages: Message[];
  chat: Pick<ChatType, 'sessionId'>;
  toolCallNotifications?: Map<string, NotificationEvent[]>; // Make optional
  append?: (value: string) => void; // Make optional
  isUserMessage: (message: Message) => boolean;
  batchSize?: number;
  batchDelay?: number;
  showLoadingThreshold?: number; // Only show loading if more than X messages
  // Custom render function for messages
  renderMessage?: (message: Message, index: number) => React.ReactNode | null;
  isStreamingMessage?: boolean; // Whether messages are currently being streamed
  onMessageUpdate?: (messageId: string, newContent: string, editType?: 'fork' | 'edit') => void;
  onRenderingComplete?: () => void; // Callback when all messages are rendered
  submitElicitationResponse?: (
    elicitationId: string,
    userData: Record<string, unknown>
  ) => Promise<boolean>;
}

export default function ProgressiveMessageList({
  messages,
  chat,
  toolCallNotifications = new Map(),
  append = () => {},
  isUserMessage,
  batchSize = 20,
  batchDelay = 20,
  showLoadingThreshold = 50,
  renderMessage, // Custom render function
  isStreamingMessage = false, // Whether messages are currently being streamed
  onMessageUpdate,
  onRenderingComplete,
  submitElicitationResponse,
}: ProgressiveMessageListProps) {
  const intl = useIntl();
  const [renderedCount, setRenderedCount] = useState(() => {
    // Initialize with either all messages (if small) or first batch (if large)
    return messages.length <= showLoadingThreshold
      ? messages.length
      : Math.min(batchSize, messages.length);
  });
  const [isLoading, setIsLoading] = useState(() => messages.length > showLoadingThreshold);
  const timeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const hasOnlyToolResponses = (message: Message) =>
    message.content.every((c) => c.type === 'toolResponse');

  const getResolvedModel = useCallback((message: Message): string | null => {
    if (message.role !== 'assistant' || !message.metadata.userVisible) return null;
    return message.metadata.inference?.resolvedModel ?? null;
  }, []);

  const getPreviousResolvedModel = useCallback(
    (index: number): string | null => {
      for (let i = index - 1; i >= 0; i--) {
        const model = getResolvedModel(messages[i]);
        if (model) return model;
      }
      return null;
    },
    [getResolvedModel, messages]
  );

  const renderModelChangeDisclosure = useCallback(
    (previousModel: string, currentModel: string) => (
      <SystemNotificationInline
        notification={{
          msg: intl.formatMessage(i18n.modelChanged, {
            previousModel: getModelDisplayName(previousModel),
            currentModel: getModelDisplayName(currentModel),
          }),
          notificationType: 'inlineMessage',
        }}
      />
    ),
    [intl]
  );

  const getSystemNotification = (message: Message): SystemNotificationContent | undefined => {
    return getCreditsExhaustedNotification(message) ?? getInlineSystemNotification(message);
  };

  const renderSystemNotification = (notification: SystemNotificationContent) => {
    switch (notification.notificationType) {
      case 'creditsExhausted':
        return <CreditsExhaustedNotification notification={notification} />;
      case 'inlineMessage':
        return <SystemNotificationInline notification={notification} />;
      default:
        return null;
    }
  };

  // Simple progressive loading - start immediately when component mounts if needed
  useEffect(() => {
    if (messages.length <= showLoadingThreshold) {
      setRenderedCount(messages.length);
      setIsLoading(false);
      // For small lists, call completion callback immediately
      if (onRenderingComplete) {
        setTimeout(() => onRenderingComplete(), 50);
      }
      return;
    }

    // Large list - start progressive loading
    const loadNextBatch = () => {
      setRenderedCount((current) => {
        const nextCount = Math.min(current + batchSize, messages.length);

        if (nextCount >= messages.length) {
          setIsLoading(false);
          // Call the completion callback after a brief delay to ensure DOM is updated
          if (onRenderingComplete) {
            setTimeout(() => onRenderingComplete(), 50);
          }
        } else {
          // Schedule next batch
          timeoutRef.current = window.setTimeout(loadNextBatch, batchDelay);
        }

        return nextCount;
      });
    };

    // Start loading after a short delay
    timeoutRef.current = window.setTimeout(loadNextBatch, batchDelay);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [
    messages.length,
    batchSize,
    batchDelay,
    showLoadingThreshold,
    renderedCount,
    onRenderingComplete,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Force complete rendering when search is active
  useEffect(() => {
    // Only add listener if we're actually loading
    if (!isLoading) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = window.electron.platform === 'darwin';
      const isSearchShortcut = (isMac ? e.metaKey : e.ctrlKey) && e.key === 'f';

      if (isSearchShortcut) {
        // Immediately render all messages when search is triggered
        setRenderedCount(messages.length);
        setIsLoading(false);
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, messages.length]);

  const toolCallGroups = useMemo(() => identifyToolCallGroups(messages), [messages]);
  const toolCallGroupStarts = useMemo(
    () => new Map(toolCallGroups.map((group) => [group[0], group])),
    [toolCallGroups]
  );
  const groupedMessageIndexes = useMemo(() => new Set(toolCallGroups.flat()), [toolCallGroups]);
  const workGroups = useMemo(() => identifyWorkGroups(messages), [messages]);
  const workGroupStarts = useMemo(
    () => new Map(workGroups.map((group) => [group[0], group])),
    [workGroups]
  );
  const workGroupedMessageIndexes = useMemo(() => new Set(workGroups.flat()), [workGroups]);
  const pendingConfirmationIds = useMemo(() => getPendingToolConfirmationIds(messages), [messages]);

  // Render messages up to the current rendered count
  const renderMessages = useCallback(() => {
    const messagesToRender = messages.slice(0, renderedCount);
    return messagesToRender
      .map((message, index) => {
        if (renderMessage) {
          if (!message.metadata.userVisible) return null;
          return renderMessage(message, index);
        }

        // Default rendering logic (for BaseChat)
        if (!chat) {
          console.warn(
            'ProgressiveMessageList: chat prop is required when not using custom renderMessage'
          );
          return null;
        }

        const workGroup = workGroupStarts.get(index);
        if (workGroup) {
          const visibleGroupIndexes = workGroup.filter(
            (messageIndex) =>
              messageIndex < renderedCount &&
              messages[messageIndex].metadata.userVisible &&
              !getPlanContent(messages[messageIndex])
          );

          if (visibleGroupIndexes.length === 0) return null;

          const lastGroupIndex = workGroup[workGroup.length - 1];
          const hasEnded = messages.slice(lastGroupIndex + 1).some((candidate) => {
            return (
              candidate.metadata.workGroupId !== message.metadata.workGroupId &&
              getToolResponses(candidate).length === 0
            );
          });
          const hasPendingApproval = workGroup.some((messageIndex) =>
            getToolRequests(messages[messageIndex]).some((request) =>
              pendingConfirmationIds.has(request.id)
            )
          );
          const isGroupActive = hasPendingApproval || (isStreamingMessage && !hasEnded);
          const duration = formatDuration(getWorkGroupDuration(messages, workGroup));

          return (
            <div
              key={`work-group-${message.metadata.workGroupId}`}
              className={`relative ${index === 0 ? 'mt-0' : 'mt-4'} assistant in-chain`}
            >
              <ToolCallGroup
                activeLabel={intl.formatMessage(i18n.working)}
                completedLabel={intl.formatMessage(i18n.workedFor, { duration })}
                isActive={isGroupActive}
              >
                {getWorkGroupEntries(messages, visibleGroupIndexes).map((entry) => {
                  if (entry.type === 'tools') {
                    const toolMessages = entry.indexes.map(
                      (messageIndex) => messages[messageIndex]
                    );
                    const forceExpanded = entry.indexes.some((messageIndex) =>
                      getToolRequests(messages[messageIndex]).some((request) =>
                        pendingConfirmationIds.has(request.id)
                      )
                    );
                    return (
                      <WorkToolActivity
                        key={`tools-${entry.indexes[0]}`}
                        forceExpanded={forceExpanded}
                        messages={toolMessages}
                      >
                        {entry.indexes.map((messageIndex) => {
                          const groupedMessage = messages[messageIndex];
                          return (
                            <div
                              key={
                                groupedMessage.id ?? `msg-${messageIndex}-${groupedMessage.created}`
                              }
                              className="relative assistant in-chain"
                              data-testid="message-container"
                            >
                              <GooseMessage
                                sessionId={chat.sessionId}
                                message={groupedMessage}
                                messages={messages}
                                append={append}
                                toolCallNotifications={toolCallNotifications}
                                isStreaming={
                                  isGroupActive &&
                                  messageIndex ===
                                    visibleGroupIndexes[visibleGroupIndexes.length - 1]
                                }
                                isInWorkGroup
                                submitElicitationResponse={submitElicitationResponse}
                              />
                            </div>
                          );
                        })}
                      </WorkToolActivity>
                    );
                  }

                  const groupedMessage = messages[entry.index];
                  return (
                    <div
                      key={groupedMessage.id ?? `msg-${entry.index}-${groupedMessage.created}`}
                      className="relative assistant in-chain"
                      data-testid="message-container"
                    >
                      <GooseMessage
                        sessionId={chat.sessionId}
                        message={groupedMessage}
                        messages={messages}
                        append={append}
                        toolCallNotifications={toolCallNotifications}
                        isStreaming={
                          isGroupActive &&
                          entry.index === visibleGroupIndexes[visibleGroupIndexes.length - 1]
                        }
                        isInWorkGroup
                        submitElicitationResponse={submitElicitationResponse}
                      />
                    </div>
                  );
                })}
              </ToolCallGroup>
            </div>
          );
        }

        if (workGroupedMessageIndexes.has(index)) return null;

        const toolCallGroup = toolCallGroupStarts.get(index);
        if (toolCallGroup) {
          const visibleGroupIndexes = toolCallGroup.filter(
            (messageIndex) =>
              messageIndex < renderedCount && messages[messageIndex].metadata.userVisible
          );

          if (visibleGroupIndexes.length === 0) return null;

          const lastGroupIndex = toolCallGroup[toolCallGroup.length - 1];
          const hasEnded = messages.slice(lastGroupIndex + 1).some((candidate) => {
            return (
              getToolRequests(candidate).length === 0 && getToolResponses(candidate).length === 0
            );
          });
          const hasPendingApproval = toolCallGroup.some((messageIndex) =>
            getToolRequests(messages[messageIndex]).some((request) =>
              pendingConfirmationIds.has(request.id)
            )
          );
          const isGroupActive = hasPendingApproval || (isStreamingMessage && !hasEnded);
          const duration = formatDuration(getToolCallGroupDuration(messages, toolCallGroup));

          return (
            <div
              key={`tool-call-group-${message.id ?? `${index}-${message.created}`}`}
              className={`relative ${index === 0 ? 'mt-0' : 'mt-4'} assistant in-chain`}
            >
              <ToolCallGroup
                activeLabel={intl.formatMessage(i18n.working)}
                completedLabel={intl.formatMessage(i18n.workedFor, { duration })}
                isActive={isGroupActive}
              >
                {visibleGroupIndexes.map((messageIndex) => {
                  const groupedMessage = messages[messageIndex];
                  const currentResolvedModel = getResolvedModel(groupedMessage);
                  const previousResolvedModel = currentResolvedModel
                    ? getPreviousResolvedModel(messageIndex)
                    : null;
                  const showModelChangeDisclosure = Boolean(
                    currentResolvedModel &&
                    previousResolvedModel &&
                    currentResolvedModel !== previousResolvedModel
                  );
                  const groupedMessageKey =
                    groupedMessage.id ?? `msg-${messageIndex}-${groupedMessage.created}`;

                  return (
                    <Fragment key={groupedMessageKey}>
                      {showModelChangeDisclosure &&
                        currentResolvedModel &&
                        previousResolvedModel &&
                        renderModelChangeDisclosure(previousResolvedModel, currentResolvedModel)}
                      <div className="relative assistant in-chain" data-testid="message-container">
                        <GooseMessage
                          sessionId={chat.sessionId}
                          message={groupedMessage}
                          messages={messages}
                          append={append}
                          toolCallNotifications={toolCallNotifications}
                          isStreaming={
                            isGroupActive &&
                            messageIndex === visibleGroupIndexes[visibleGroupIndexes.length - 1]
                          }
                          isInToolCallGroup
                          submitElicitationResponse={submitElicitationResponse}
                        />
                      </div>
                    </Fragment>
                  );
                })}
              </ToolCallGroup>
            </div>
          );
        }

        if (groupedMessageIndexes.has(index) || !message.metadata.userVisible) {
          return null;
        }

        const notification = getSystemNotification(message);
        if (notification) {
          return (
            <div
              key={`notification-${message.id ?? `msg-${index}-${message.created}`}`}
              className={`relative ${index === 0 ? 'mt-0' : 'mt-4'} assistant`}
              data-testid="message-container"
            >
              {renderSystemNotification(notification)}
            </div>
          );
        }

        const isUser = isUserMessage(message);
        const currentResolvedModel = getResolvedModel(message);
        const previousResolvedModel = currentResolvedModel ? getPreviousResolvedModel(index) : null;
        const showModelChangeDisclosure = Boolean(
          currentResolvedModel &&
          previousResolvedModel &&
          currentResolvedModel !== previousResolvedModel
        );

        const messageKey = message.id ?? `msg-${index}-${message.created}`;

        return (
          <Fragment key={messageKey}>
            {showModelChangeDisclosure &&
              currentResolvedModel &&
              previousResolvedModel &&
              renderModelChangeDisclosure(previousResolvedModel, currentResolvedModel)}
            <div
              className={`relative ${index === 0 ? 'mt-0' : 'mt-4'} ${isUser ? 'user' : 'assistant'}`}
              data-testid="message-container"
            >
              {isUser ? (
                !hasOnlyToolResponses(message) && (
                  <UserMessage message={message} onMessageUpdate={onMessageUpdate} />
                )
              ) : (
                <GooseMessage
                  sessionId={chat.sessionId}
                  message={message}
                  messages={messages}
                  append={append}
                  toolCallNotifications={toolCallNotifications}
                  isStreaming={
                    isStreamingMessage &&
                    !isUser &&
                    index === messagesToRender.length - 1 &&
                    message.role === 'assistant'
                  }
                  submitElicitationResponse={submitElicitationResponse}
                />
              )}
            </div>
          </Fragment>
        );
      })
      .filter(Boolean);
  }, [
    messages,
    renderedCount,
    renderMessage,
    isUserMessage,
    chat,
    append,
    toolCallNotifications,
    isStreamingMessage,
    onMessageUpdate,
    toolCallGroupStarts,
    groupedMessageIndexes,
    workGroupStarts,
    workGroupedMessageIndexes,
    pendingConfirmationIds,
    submitElicitationResponse,
    getPreviousResolvedModel,
    getResolvedModel,
    renderModelChangeDisclosure,
    intl,
  ]);

  return (
    <>
      {renderMessages()}

      {/* Loading indicator when progressively rendering */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-8">
          <LoadingGoose
            message={intl.formatMessage(i18n.loadingMessages, {
              renderedCount,
              totalCount: messages.length,
            })}
          />
          <div className="text-xs text-text-secondary mt-2">
            {intl.formatMessage(i18n.searchHint)}
          </div>
        </div>
      )}
    </>
  );
}

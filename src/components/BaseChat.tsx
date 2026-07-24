import { AppEvents } from '../constants/events';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defineMessages, useIntl } from '../i18n';
import { useLocation, useNavigate } from 'react-router-dom';
import { SearchView } from './conversation/SearchView';
import ProgressiveMessageList from './ProgressiveMessageList';
import LoadingGoose from './LoadingGoose';
import { MainPanelLayout } from './Layout/MainPanelLayout';
import ChatInput from './ChatInput';
import { ChatInputCard } from './ChatInputCard';
import { ScrollArea, ScrollAreaHandle } from './ui/scroll-area';
import { useFileDrop } from '../hooks/useFileDrop';
import { ChatState } from '../types/chatState';
import { ChatType } from '../types/chat';
import { useIsMobile } from '../hooks/use-mobile';
import { useNavigationContextSafe } from './Layout/NavigationContext';
import { useWorkspacePanelsSafe } from '../contexts/WorkspacePanelsContext';
import { cn } from '../utils';
import { useChatSession } from '../hooks/useChatSession';
import { acpUpdateWorkingDir } from '../acp/sessions';
import { useNavigation } from '../hooks/useNavigation';
import {
  getPlanContent,
  getTextAndImageContent,
  type Message,
  type UserInput,
} from '../types/message';
import { useAutoSubmit } from '../hooks/useAutoSubmit';
import SessionActionsHeader from './SessionActionsHeader';
import { isAcpRecovering, subscribeToAcpRecovery } from '../acp/acpConnection';
import PlanSteps from './PlanSteps';

const i18n = defineMessages({
  failedToLoadSession: {
    id: 'baseChat.failedToLoadSession',
    defaultMessage: 'Failed to Load Session',
  },
  goHome: {
    id: 'baseChat.goHome',
    defaultMessage: 'Go home',
  },
  reconnecting: {
    id: 'baseChat.reconnecting',
    defaultMessage: 'Connection lost. Reconnecting…',
  },
});

const CHAT_CONTENT_WIDTH = 'mx-auto w-[calc(100%_-_2rem)] max-w-4xl sm:w-[calc(100%_-_4rem)]';

interface BaseChatProps {
  setChat: (chat: ChatType) => void;
  onMessageSubmit?: (message: string) => void;
  renderHeader?: () => React.ReactNode;
  customChatInputProps?: Record<string, unknown>;
  customMainLayoutProps?: Record<string, unknown>;
  contentClassName?: string;
  disableSearch?: boolean;
  suppressEmptyState: boolean;
  sessionId: string;
  isActiveSession: boolean;
  initialMessage?: UserInput;
  noAutoSubmit?: boolean;
}

export default function BaseChat({
  setChat,
  renderHeader,
  customChatInputProps = {},
  customMainLayoutProps = {},
  sessionId,
  initialMessage,
  noAutoSubmit,
  isActiveSession,
}: BaseChatProps) {
  const intl = useIntl();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<ScrollAreaHandle>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const disableAnimation = location.state?.disableAnimation || false;
  const [acpRecovering, setAcpRecovering] = useState(isAcpRecovering);
  const isMobile = useIsMobile();
  const navContext = useNavigationContextSafe();
  const setView = useNavigation();
  const isNavCollapsed = !navContext?.isNavExpanded;
  const contentClassName = cn('pr-1 pb-10 pt-12', (isMobile || isNavCollapsed) && 'pt-16');
  const { droppedFiles, setDroppedFiles, handleDrop, handleDragOver } = useFileDrop();
  const onStreamFinish = useCallback(() => {}, []);

  useEffect(() => subscribeToAcpRecovery(setAcpRecovering), []);

  const {
    session,
    messages,
    chatState,
    progressMessage,
    updateSession,
    handleSubmit,
    onSteerQueuedMessage,
    submitElicitationResponse,
    stopStreaming,
    sessionLoadError,
    tokenState,
    notifications: toolCallNotifications,
    pauseQueueOnStop,
    queueProcessingBlocked,
    onMessageUpdate,
  } = useChatSession({
    sessionId,
    onStreamFinish,
  });

  const workspacePanels = useWorkspacePanelsSafe();
  const setPanelsWorkingDir = workspacePanels?.setWorkingDir;
  const sessionWorkingDir = session?.working_dir;
  useEffect(() => {
    if (isActiveSession && sessionWorkingDir && setPanelsWorkingDir) {
      setPanelsWorkingDir(sessionWorkingDir);
    }
  }, [isActiveSession, sessionWorkingDir, setPanelsWorkingDir]);

  const handleWorkingDirChange = useCallback(
    async (newDir: string) => {
      if (!session) {
        throw new Error('Cannot update working directory before ACP session is loaded');
      }
      await acpUpdateWorkingDir(session.id, newDir);
      updateSession((currentSession) => ({ ...currentSession, working_dir: newDir }));
    },
    [session, updateSession]
  );

  // noAutoSubmit only suppresses auto-submitting the initial prompt of a fresh session
  // (icodex://new-session?prompt=...). Once the conversation has messages, later flows
  // such as forks or resumes should auto-submit normally.
  const suppressInitialAutoSubmit = noAutoSubmit && messages.length === 0;
  const canAutoSubmit = !acpRecovering && !suppressInitialAutoSubmit;

  useAutoSubmit({
    sessionId,
    session,
    messages,
    chatState,
    initialMessage,
    canAutoSubmit,
    handleSubmit,
  });

  useEffect(() => {
    let streamState: 'idle' | 'loading' | 'streaming' | 'error' = 'idle';
    if (chatState === ChatState.LoadingConversation) {
      streamState = 'loading';
    } else if (
      chatState === ChatState.Streaming ||
      chatState === ChatState.Thinking ||
      chatState === ChatState.Compacting
    ) {
      streamState = 'streaming';
    } else if (sessionLoadError) {
      streamState = 'error';
    }

    window.dispatchEvent(
      new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
        detail: {
          sessionId,
          streamState,
          messageCount: messages.length,
        },
      })
    );
  }, [sessionId, chatState, messages.length, sessionLoadError]);

  // Generate command history from user messages (most recent first)
  const commandHistory = useMemo(() => {
    return messages
      .reduce<string[]>((history, message) => {
        if (message.role === 'user') {
          const text = getTextAndImageContent(message).textContent.trim();
          if (text) {
            history.push(text);
          }
        }
        return history;
      }, [])
      .reverse();
  }, [messages]);

  const awaitingResponse = useMemo(() => {
    if (chatState === ChatState.Idle || chatState === ChatState.LoadingConversation) return false;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message.metadata.userVisible) continue;
      return message.role === 'user';
    }
    return false;
  }, [chatState, messages]);

  const activePlan = useMemo(() => {
    if (chatState === ChatState.Idle) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const plan = getPlanContent(messages[i]);
      if (plan) return plan;
    }
    return null;
  }, [chatState, messages]);

  const sessionModel = session?.model_config?.model_name ?? null;
  const sessionProvider = session?.provider_name ?? null;
  const sessionLoaded = session !== undefined;
  const latestInference = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (
        message.role === 'assistant' &&
        message.metadata.userVisible &&
        message.metadata.inference
      ) {
        return message.metadata.inference;
      }
    }
    return null;
  }, [messages]);

  // Track if this is the initial render for session resuming
  const initialRenderRef = useRef(true);

  // Auto-scroll when messages are loaded (for session resuming)
  const handleRenderingComplete = React.useCallback(() => {
    // Only force scroll on the very first render
    if (initialRenderRef.current && messages.length > 0) {
      initialRenderRef.current = false;
      if (scrollRef.current?.scrollToBottom) {
        scrollRef.current.scrollToBottom();
      }
    } else if (scrollRef.current?.isFollowing) {
      if (scrollRef.current?.scrollToBottom) {
        scrollRef.current.scrollToBottom();
      }
    }
  }, [messages.length]);

  // Listen for global scroll-to-bottom requests (e.g., from MCP App message actions)
  useEffect(() => {
    const handleGlobalScrollRequest = () => {
      // Add a small delay to ensure content has been rendered
      setTimeout(() => {
        if (scrollRef.current?.scrollToBottom) {
          scrollRef.current.scrollToBottom();
        }
      }, 200);
    };

    window.addEventListener(AppEvents.SCROLL_CHAT_TO_BOTTOM, handleGlobalScrollRequest);
    return () =>
      window.removeEventListener(AppEvents.SCROLL_CHAT_TO_BOTTOM, handleGlobalScrollRequest);
  }, []);

  useEffect(() => {
    if (
      isActiveSession &&
      sessionId &&
      chatInputRef.current &&
      chatState !== ChatState.LoadingConversation
    ) {
      const timeoutId = setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isActiveSession, sessionId, chatState]);

  useEffect(() => {
    const handleSessionForked = (event: Event) => {
      const customEvent = event as CustomEvent<{
        newSessionId: string;
        shouldStartAgent?: boolean;
        editedMessage?: string;
      }>;
      window.dispatchEvent(new CustomEvent(AppEvents.SESSION_CREATED));
      const { newSessionId, shouldStartAgent, editedMessage } = customEvent.detail;

      const params = new URLSearchParams();
      params.set('resumeSessionId', newSessionId);
      if (shouldStartAgent) {
        params.set('shouldStartAgent', 'true');
      }

      navigate(`/pair?${params.toString()}`, {
        state: {
          disableAnimation: true,
          initialMessage: editedMessage ? { msg: editedMessage, images: [] } : undefined,
        },
      });
    };

    window.addEventListener(AppEvents.SESSION_FORKED, handleSessionForked);

    return () => {
      window.removeEventListener(AppEvents.SESSION_FORKED, handleSessionForked);
    };
  }, [location.pathname, navigate]);

  const lastSetNameRef = useRef<string>('');

  useEffect(() => {
    const currentSessionName = session?.name;
    if (currentSessionName && currentSessionName !== lastSetNameRef.current) {
      lastSetNameRef.current = currentSessionName;
      setChat({
        messages,
        sessionId,
        name: currentSessionName,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.name, setChat]);

  const initialPrompt =
    noAutoSubmit && messages.length === 0 && initialMessage?.msg ? initialMessage.msg : '';

  if (sessionLoadError) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <MainPanelLayout
          backgroundColor={'bg-background-primary'}
          removeTopPadding={true}
          {...customMainLayoutProps}
        >
          {renderHeader && renderHeader()}
          <div className="flex flex-col flex-1 min-h-0 relative">
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center justify-center p-8">
                <div className="text-red-700 dark:text-red-300 bg-red-400/50 p-4 rounded-lg mb-4 max-w-md">
                  <h3 className="font-semibold mb-2">
                    {intl.formatMessage(i18n.failedToLoadSession)}
                  </h3>
                  <p className="text-sm">{sessionLoadError}</p>
                </div>
                <button
                  onClick={() => {
                    setView('chat');
                  }}
                  className="px-4 py-2 text-center cursor-pointer text-text-primary border border-border-primary hover:bg-background-secondary rounded-lg transition-all duration-150"
                >
                  {intl.formatMessage(i18n.goHome)}
                </button>
              </div>
            </div>
          </div>
        </MainPanelLayout>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <MainPanelLayout
        backgroundColor={'bg-background-primary'}
        removeTopPadding={true}
        {...customMainLayoutProps}
      >
        {/* Custom header */}
        {renderHeader && renderHeader()}

        {/* Chat container */}
        <div className="flex flex-col flex-1 min-h-0 relative">
          <SessionActionsHeader session={session} onSessionChange={updateSession} />

          <ScrollArea
            ref={scrollRef}
            className={`flex-1 min-h-0 relative ${contentClassName}`}
            autoScroll
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            data-drop-zone="true"
            paddingY={0}
          >
            {messages.length > 0 ? (
              <>
                <SearchView>
                  <div className={CHAT_CONTENT_WIDTH} data-testid="chat-content">
                    <ProgressiveMessageList
                      messages={messages}
                      chat={{ sessionId }}
                      toolCallNotifications={toolCallNotifications}
                      append={(text: string) => handleSubmit({ msg: text, images: [] })}
                      isUserMessage={(m: Message) => m.role === 'user'}
                      isStreamingMessage={chatState !== ChatState.Idle}
                      onRenderingComplete={handleRenderingComplete}
                      onMessageUpdate={onMessageUpdate}
                      submitElicitationResponse={submitElicitationResponse}
                    />
                    {awaitingResponse && (
                      <LoadingGoose chatState={chatState} message={progressMessage} />
                    )}
                  </div>
                </SearchView>

                <div className="block h-8" />
              </>
            ) : null}
          </ScrollArea>

        </div>

        {acpRecovering && (
          <div role="status" className="mx-4 mb-2 text-sm text-text-secondary">
            {intl.formatMessage(i18n.reconnecting)}
          </div>
        )}

        {activePlan && (
          <div className="relative z-30 mx-4 mb-2 flex justify-center">
            <PlanSteps plan={activePlan} />
          </div>
        )}

        <ChatInputCard
          className={cn(
            'relative z-10 mb-4',
            CHAT_CONTENT_WIDTH,
            !disableAnimation && 'animate-[fadein_400ms_ease-in_forwards]'
          )}
        >
          <ChatInput
            inputRef={chatInputRef}
            sessionId={sessionId}
            handleSubmit={handleSubmit}
            chatState={chatState}
            onStop={stopStreaming}
            onSteerQueuedMessage={onSteerQueuedMessage}
            pauseQueueOnStop={pauseQueueOnStop}
            queueProcessingBlocked={queueProcessingBlocked || acpRecovering}
            commandHistory={commandHistory}
            initialValue={initialPrompt}
            setView={setView}
            totalTokens={tokenState?.totalTokens ?? session?.usage?.total_tokens ?? undefined}
            accumulatedInputTokens={
              tokenState?.accumulatedInputTokens ??
              session?.accumulated_usage?.input_tokens ??
              undefined
            }
            accumulatedOutputTokens={
              tokenState?.accumulatedOutputTokens ??
              session?.accumulated_usage?.output_tokens ??
              undefined
            }
            accumulatedCost={tokenState?.accumulatedCost ?? session?.accumulated_cost ?? undefined}
            droppedFiles={droppedFiles}
            onFilesProcessed={() => setDroppedFiles([])} // Clear dropped files after processing
            messages={messages}
            disableAnimation={disableAnimation}
            initialPrompt={initialPrompt}
            sessionModel={sessionModel}
            sessionProvider={sessionProvider}
            sessionLoaded={sessionLoaded}
            workingDir={session?.working_dir}
            onWorkingDirChange={handleWorkingDirChange}
            latestInference={latestInference}
            {...customChatInputProps}
          />
        </ChatInputCard>
      </MainPanelLayout>
    </div>
  );
}

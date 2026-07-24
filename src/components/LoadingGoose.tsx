import { ChatState } from '../types/chatState';
import { defineMessages, useIntl } from '../i18n';

interface LoadingGooseProps {
  message?: string;
  chatState?: ChatState;
}

const i18n = defineMessages({
  loadingConversation: {
    id: 'loadingGoose.loadingConversation',
    defaultMessage: 'loading…',
  },
  thinking: {
    id: 'loadingGoose.thinking',
    defaultMessage: 'Thinking...',
  },
  streaming: {
    id: 'loadingGoose.streaming',
    defaultMessage: 'Thinking...',
  },
  waiting: {
    id: 'loadingGoose.waiting',
    defaultMessage: 'waiting',
  },
  compacting: {
    id: 'loadingGoose.compacting',
    defaultMessage: 'compacting',
  },
  idle: {
    id: 'loadingGoose.idle',
    defaultMessage: 'Thinking...',
  },
  restartingAgent: {
    id: 'loadingGoose.restartingAgent',
    defaultMessage: 'restarting…',
  },
});

const STATE_MESSAGE_KEYS: Record<ChatState, keyof typeof i18n> = {
  [ChatState.LoadingConversation]: 'loadingConversation',
  [ChatState.Thinking]: 'thinking',
  [ChatState.Streaming]: 'streaming',
  [ChatState.WaitingForUserInput]: 'waiting',
  [ChatState.Compacting]: 'compacting',
  [ChatState.Idle]: 'idle',
  [ChatState.RestartingAgent]: 'restartingAgent',
};

const LoadingGoose = ({ message, chatState = ChatState.Idle }: LoadingGooseProps) => {
  const intl = useIntl();
  const displayMessage = message || intl.formatMessage(i18n[STATE_MESSAGE_KEYS[chatState]]);

  return (
    <div className="w-full animate-fade-slide-up">
      <div data-testid="loading-indicator" className="text-xs text-text-secondary py-2">
        {displayMessage}
      </div>
    </div>
  );
};

export default LoadingGoose;

import type { FileAttachment, ImageData } from '../../types/message';

export interface QueuedMessage {
  id: string;
  content: string;
  timestamp: number;
  images: ImageData[];
  files?: FileAttachment[];
  skill?: string;
}

export const moveQueuedMessageToFront = (
  messages: QueuedMessage[],
  messageId: string
): QueuedMessage[] => {
  const selected = messages.find((message) => message.id === messageId);
  if (!selected) return messages;
  return [selected, ...messages.filter((message) => message.id !== messageId)];
};

export const removeQueuedMessage = (
  messages: QueuedMessage[],
  messageId: string
): QueuedMessage[] => messages.filter((message) => message.id !== messageId);

export const editQueuedMessage = (
  messages: QueuedMessage[],
  messageId: string,
  content: string
): QueuedMessage[] =>
  messages.map((message) => (message.id === messageId ? { ...message, content } : message));

export interface QueueReadinessInput {
  wasLoading: boolean;
  isLoading: boolean;
  wasBlocked: boolean;
  isBlocked: boolean;
  hasSendNowInFlight: boolean;
  queueLength: number;
}

/**
 * The queue only fires on the edge into a runnable state — a turn finishing or the
 * block lifting — never on every render while already idle.
 */
export const isQueueReadyToSend = ({
  wasLoading,
  isLoading,
  wasBlocked,
  isBlocked,
  hasSendNowInFlight,
  queueLength,
}: QueueReadinessInput): boolean => {
  const becameIdle = wasLoading && !isLoading;
  const becameUnblocked = wasBlocked && !isBlocked;
  return (
    (becameIdle || (becameUnblocked && !isLoading)) &&
    !isBlocked &&
    !hasSendNowInFlight &&
    queueLength > 0
  );
};

export interface QueueSelection {
  message?: QueuedMessage;
  sendAfterStop: boolean;
}

/**
 * A pending stop-and-send targets one specific message; everything else takes the head.
 * A target that has since left the queue yields no message but keeps its flag, so the
 * caller can clear the stale reservation.
 */
export const selectNextQueuedMessage = (
  messages: QueuedMessage[],
  pendingSendAfterStopId: string | null
): QueueSelection => {
  if (!pendingSendAfterStopId) {
    return { message: messages[0], sendAfterStop: false };
  }
  const target = messages.find((message) => message.id === pendingSendAfterStopId);
  return { message: target, sendAfterStop: target !== undefined };
};

export interface QueueSendDecision {
  paused: boolean;
  interrupted: boolean;
  sendAfterStop: boolean;
}

export const shouldSendQueuedMessage = ({
  paused,
  interrupted,
  sendAfterStop,
}: QueueSendDecision): boolean => !paused || interrupted || sendAfterStop;

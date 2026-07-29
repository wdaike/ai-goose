import { useCallback, useEffect, useRef, useState } from 'react';
import {
  editQueuedMessage,
  isQueueReadyToSend,
  moveQueuedMessageToFront,
  removeQueuedMessage,
  selectNextQueuedMessage,
  shouldSendQueuedMessage,
  type QueuedMessage,
} from '../codex/engine/messageQueue';
import { LocalMessageStorage } from '../utils/localMessageStorage';
import type { UserInput } from '../types/message';

const PAUSED_STORAGE_KEY = 'goose-queue-paused';
const INTERRUPTION_STORAGE_KEY = 'goose-queue-interruption';

const persist = (key: string, value: unknown) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
  }
};

const toUserInput = (message: QueuedMessage): UserInput => ({
  msg: message.content,
  images: message.images,
  files: message.files,
  skill: message.skill,
});

export interface UseMessageQueueOptions {
  isLoading: boolean;
  queueProcessingBlocked: boolean;
  pauseQueueOnStop: boolean;
  onSubmit: (input: UserInput) => void;
  onStop?: () => void;
  onSteerQueuedMessage?: (input: UserInput) => Promise<boolean>;
}

export function useMessageQueue({
  isLoading,
  queueProcessingBlocked,
  pauseQueueOnStop,
  onSubmit,
  onStop,
  onSteerQueuedMessage,
}: UseMessageQueueOptions) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [lastInterruption, setLastInterruption] = useState<string | null>(null);
  const [sendNowInFlightMessageIds, setSendNowInFlightMessageIds] = useState<ReadonlySet<string>>(
    new Set()
  );

  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const queuedMessagesRef = useRef<QueuedMessage[]>([]);
  queuedMessagesRef.current = queuedMessages;

  // The ref is the synchronous truth callbacks read mid-flight; the state mirrors it for render
  const setPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused;
    setIsPaused(paused);
  }, []);
  const editingMessageIdRef = useRef<string | null>(null);
  const sendAfterStopMessageIdRef = useRef<string | null>(null);
  const sendNowInFlightMessageIdsRef = useRef<Set<string>>(new Set());

  const isLoadingRef = useRef(isLoading);
  const blockedRef = useRef(queueProcessingBlocked);
  const wasLoadingRef = useRef(isLoading);
  const wasBlockedRef = useRef(queueProcessingBlocked);
  isLoadingRef.current = isLoading;
  blockedRef.current = queueProcessingBlocked;

  const setSendNowInFlightMessage = useCallback((messageId: string, isInFlight: boolean) => {
    const next = new Set(sendNowInFlightMessageIdsRef.current);
    if (isInFlight) {
      next.add(messageId);
    } else {
      next.delete(messageId);
    }
    sendNowInFlightMessageIdsRef.current = next;
    setSendNowInFlightMessageIds(next);
  }, []);

  const pauseRemaining = useCallback(() => setPaused(true), [setPaused]);

  const clearPendingSendAfterStop = useCallback((messageId?: string) => {
    if (!messageId || sendAfterStopMessageIdRef.current === messageId) {
      sendAfterStopMessageIdRef.current = null;
    }
  }, []);

  const clearQueueState = useCallback(() => {
    setPaused(false);
    sendAfterStopMessageIdRef.current = null;
    setLastInterruption(null);
  }, [setPaused]);

  const send = useCallback(
    (message: QueuedMessage) => {
      LocalMessageStorage.addMessage(message.content);
      onSubmit(toUserInput(message));
    },
    [onSubmit]
  );

  useEffect(() => {
    persist(PAUSED_STORAGE_KEY, pausedRef.current);
  }, [queuedMessages]);

  useEffect(() => {
    persist(INTERRUPTION_STORAGE_KEY, lastInterruption);
  }, [lastInterruption]);

  useEffect(
    () => () => {
      persist(PAUSED_STORAGE_KEY, pausedRef.current);
      persist(INTERRUPTION_STORAGE_KEY, lastInterruption);
    },
    [lastInterruption]
  );

  useEffect(() => {
    if (
      isQueueReadyToSend({
        wasLoading: wasLoadingRef.current,
        isLoading,
        wasBlocked: wasBlockedRef.current,
        isBlocked: queueProcessingBlocked,
        hasSendNowInFlight: sendNowInFlightMessageIdsRef.current.size > 0,
        queueLength: queuedMessages.length,
      })
    ) {
      const pendingSendAfterStopId = sendAfterStopMessageIdRef.current;
      const { message, sendAfterStop } = selectNextQueuedMessage(
        queuedMessages,
        pendingSendAfterStopId
      );

      if (!message) {
        if (pendingSendAfterStopId) clearPendingSendAfterStop(pendingSendAfterStopId);
      } else if (
        shouldSendQueuedMessage({
          paused: pausedRef.current,
          interrupted: Boolean(lastInterruption),
          sendAfterStop,
        })
      ) {
        send(message);
        if (sendAfterStop) clearPendingSendAfterStop(message.id);
        const next = sendAfterStop
          ? removeQueuedMessage(queuedMessages, message.id)
          : queuedMessages.slice(1);
        setQueuedMessages(next);
        if (next.length === 0) {
          clearQueueState();
        } else if (sendAfterStop) {
          pauseRemaining();
        }

        // The queue stays paused after an interruption; resuming is the user's call
        if (lastInterruption) {
          setLastInterruption(null);
          pauseRemaining();
        }
      }
    }
    wasLoadingRef.current = isLoading;
    wasBlockedRef.current = queueProcessingBlocked;
  }, [
    isLoading,
    queueProcessingBlocked,
    queuedMessages,
    lastInterruption,
    send,
    clearPendingSendAfterStop,
    clearQueueState,
    pauseRemaining,
  ]);

  const enqueue = useCallback(
    (message: QueuedMessage) => {
      if (queuedMessagesRef.current.length === 0) {
        setPaused(false);
        setLastInterruption(null);
      }
      setQueuedMessages((prev) => [...prev, message]);
    },
    [setPaused]
  );

  const enqueueInterruption = useCallback(
    (message: QueuedMessage, matchedText: string) => {
      setLastInterruption(matchedText);
      onStop?.();
      pauseRemaining();
      setQueuedMessages((prev) => [message, ...prev]);
    },
    [onStop, pauseRemaining]
  );

  /** A plain message sent while an interruption pause is in effect lifts that pause. */
  const resumeAfterNonInterruption = useCallback(() => {
    if (pausedRef.current && lastInterruption) {
      setPaused(false);
      setLastInterruption(null);
    }
  }, [lastInterruption, setPaused]);

  const remove = useCallback(
    (messageId: string) => {
      if (sendNowInFlightMessageIdsRef.current.has(messageId)) return;
      clearPendingSendAfterStop(messageId);
      setQueuedMessages((prev) => removeQueuedMessage(prev, messageId));
    },
    [clearPendingSendAfterStop]
  );

  const clear = useCallback(() => {
    if (sendNowInFlightMessageIdsRef.current.size > 0) return;
    setQueuedMessages([]);
    clearQueueState();
  }, [clearQueueState]);

  const reorder = useCallback((reordered: QueuedMessage[]) => {
    if (reordered.some((message) => sendNowInFlightMessageIdsRef.current.has(message.id))) return;
    setQueuedMessages(reordered);
  }, []);

  const edit = useCallback((messageId: string, content: string) => {
    if (sendNowInFlightMessageIdsRef.current.has(messageId)) return;
    setQueuedMessages((prev) => editQueuedMessage(prev, messageId, content));
  }, []);

  const stopAndSend = useCallback(
    async (messageId: string) => {
      const message = queuedMessages.find((queued) => queued.id === messageId);
      if (!message || queueProcessingBlocked) return;

      if (!isLoading) {
        setQueuedMessages((prev) => removeQueuedMessage(prev, messageId));
        send(message);
        return;
      }

      if (onSteerQueuedMessage) {
        if (sendNowInFlightMessageIdsRef.current.has(messageId)) return;

        const wasPausedBeforeSteer = pausedRef.current;
        pauseRemaining();
        setSendNowInFlightMessage(messageId, true);
        try {
          if (await onSteerQueuedMessage(toUserInput(message))) {
            LocalMessageStorage.addMessage(message.content);
            clearPendingSendAfterStop(messageId);
            const next = removeQueuedMessage(queuedMessagesRef.current, messageId);
            setQueuedMessages(next);
            if (next.length === 0) {
              clearQueueState();
            } else {
              pauseRemaining();
            }
            return;
          }
        } finally {
          setSendNowInFlightMessage(messageId, false);
        }

        // Steer was refused but the turn ended meanwhile — send it as a fresh turn
        if (!isLoadingRef.current && !blockedRef.current) {
          setPaused(wasPausedBeforeSteer);
          const next = removeQueuedMessage(queuedMessagesRef.current, messageId);
          setQueuedMessages(next);
          if (next.length === 0) clearQueueState();
          send(message);
          return;
        }
      }

      sendAfterStopMessageIdRef.current = messageId;
      pauseRemaining();
      setQueuedMessages((prev) => moveQueuedMessageToFront(prev, messageId));
      onStop?.();
    },
    [
      queuedMessages,
      queueProcessingBlocked,
      isLoading,
      onSteerQueuedMessage,
      onStop,
      send,
      pauseRemaining,
      setPaused,
      setSendNowInFlightMessage,
      clearPendingSendAfterStop,
      clearQueueState,
    ]
  );

  const stop = useCallback(() => {
    if (pauseQueueOnStop && queuedMessages.length > 0) {
      pauseRemaining();
    }
    onStop?.();
  }, [pauseQueueOnStop, queuedMessages.length, pauseRemaining, onStop]);

  const resume = useCallback(() => {
    setPaused(false);
    setLastInterruption(null);
    if (isLoading || queueProcessingBlocked || queuedMessages.length === 0) return;

    send(queuedMessages[0]);
    setQueuedMessages(queuedMessages.slice(1));
  }, [isLoading, queueProcessingBlocked, queuedMessages, send, setPaused]);

  return {
    queuedMessages,
    lastInterruption,
    sendNowInFlightMessageIds,
    editingMessageIdRef,
    isPaused,
    enqueue,
    enqueueInterruption,
    resumeAfterNonInterruption,
    remove,
    clear,
    reorder,
    edit,
    stopAndSend,
    stop,
    resume,
  };
}

import { describe, expect, it } from 'vitest';
import {
  editQueuedMessage,
  isQueueReadyToSend,
  moveQueuedMessageToFront,
  removeQueuedMessage,
  selectNextQueuedMessage,
  shouldSendQueuedMessage,
  type QueuedMessage,
} from './messageQueue';

const message = (id: string, content = id): QueuedMessage => ({
  id,
  content,
  timestamp: 0,
  images: [],
});

const queue = [message('a'), message('b'), message('c')];

const readiness = (overrides: Partial<Parameters<typeof isQueueReadyToSend>[0]> = {}) =>
  isQueueReadyToSend({
    wasLoading: true,
    isLoading: false,
    wasBlocked: false,
    isBlocked: false,
    hasSendNowInFlight: false,
    queueLength: 1,
    ...overrides,
  });

describe('moveQueuedMessageToFront', () => {
  it('hoists the target and preserves the rest in order', () => {
    expect(moveQueuedMessageToFront(queue, 'c').map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns the queue untouched when the id is absent', () => {
    expect(moveQueuedMessageToFront(queue, 'zz')).toBe(queue);
  });

  it('is a no-op for a message already at the front', () => {
    expect(moveQueuedMessageToFront(queue, 'a').map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('removeQueuedMessage', () => {
  it('drops only the matching message', () => {
    expect(removeQueuedMessage(queue, 'b').map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('leaves the queue alone for an unknown id', () => {
    expect(removeQueuedMessage(queue, 'zz').map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('editQueuedMessage', () => {
  it('replaces content without touching identity or siblings', () => {
    const edited = editQueuedMessage(queue, 'b', 'new text');
    expect(edited[1]).toEqual({ ...message('b'), content: 'new text' });
    expect(edited[0]).toBe(queue[0]);
  });

  it('ignores an unknown id', () => {
    expect(editQueuedMessage(queue, 'zz', 'x')).toEqual(queue);
  });
});

describe('isQueueReadyToSend', () => {
  it('fires on the edge from loading to idle', () => {
    expect(readiness()).toBe(true);
  });

  it('does not fire while a turn is still running', () => {
    expect(readiness({ isLoading: true })).toBe(false);
  });

  it('does not re-fire once already idle', () => {
    expect(readiness({ wasLoading: false })).toBe(false);
  });

  it('fires when the block lifts while idle', () => {
    expect(readiness({ wasLoading: false, wasBlocked: true })).toBe(true);
  });

  it('does not fire when the block lifts but a turn is running', () => {
    expect(readiness({ wasLoading: false, wasBlocked: true, isLoading: true })).toBe(false);
  });

  it('stays put while still blocked', () => {
    expect(readiness({ isBlocked: true })).toBe(false);
  });

  it('defers to an in-flight steer', () => {
    expect(readiness({ hasSendNowInFlight: true })).toBe(false);
  });

  it('does nothing with an empty queue', () => {
    expect(readiness({ queueLength: 0 })).toBe(false);
  });
});

describe('selectNextQueuedMessage', () => {
  it('takes the head when nothing is reserved', () => {
    expect(selectNextQueuedMessage(queue, null)).toEqual({ message: queue[0], sendAfterStop: false });
  });

  it('takes the reserved message even from mid-queue', () => {
    expect(selectNextQueuedMessage(queue, 'c')).toEqual({ message: queue[2], sendAfterStop: true });
  });

  it('reports no message when the reservation went stale', () => {
    expect(selectNextQueuedMessage(queue, 'gone')).toEqual({
      message: undefined,
      sendAfterStop: false,
    });
  });

  it('yields no message for an empty queue', () => {
    expect(selectNextQueuedMessage([], null).message).toBeUndefined();
  });
});

describe('shouldSendQueuedMessage', () => {
  it('sends when the queue is running', () => {
    expect(
      shouldSendQueuedMessage({ paused: false, interrupted: false, sendAfterStop: false })
    ).toBe(true);
  });

  it('holds when paused', () => {
    expect(shouldSendQueuedMessage({ paused: true, interrupted: false, sendAfterStop: false })).toBe(
      false
    );
  });

  it('an interruption overrides the pause', () => {
    expect(shouldSendQueuedMessage({ paused: true, interrupted: true, sendAfterStop: false })).toBe(
      true
    );
  });

  it('a stop-and-send reservation overrides the pause', () => {
    expect(shouldSendQueuedMessage({ paused: true, interrupted: false, sendAfterStop: true })).toBe(
      true
    );
  });
});

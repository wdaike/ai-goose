import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageQueue, type UseMessageQueueOptions } from './useMessageQueue';
import type { QueuedMessage } from '../codex/engine/messageQueue';

vi.mock('../utils/localMessageStorage', () => ({
  LocalMessageStorage: { addMessage: vi.fn() },
}));

const message = (id: string): QueuedMessage => ({
  id,
  content: `content-${id}`,
  timestamp: 0,
  images: [],
});

const setup = (overrides: Partial<UseMessageQueueOptions> = {}) => {
  const onSubmit = vi.fn();
  const onStop = vi.fn();
  const options: UseMessageQueueOptions = {
    isLoading: false,
    queueProcessingBlocked: false,
    pauseQueueOnStop: false,
    onSubmit,
    onStop,
    ...overrides,
  };
  const view = renderHook((props: UseMessageQueueOptions) => useMessageQueue(props), {
    initialProps: options,
  });
  return { ...view, onSubmit, onStop, options };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('enqueue', () => {
  it('appends to the end of the queue', () => {
    const { result } = setup();
    act(() => result.current.enqueue(message('a')));
    act(() => result.current.enqueue(message('b')));
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('does not send while a turn is running', () => {
    const { result, onSubmit } = setup({ isLoading: true });
    act(() => result.current.enqueue(message('a')));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.queuedMessages).toHaveLength(1);
  });
});

describe('draining on turn completion', () => {
  it('sends the head once the turn ends and drops it from the queue', () => {
    const { result, rerender, onSubmit, options } = setup({ isLoading: true });
    act(() => result.current.enqueue(message('a')));
    act(() => result.current.enqueue(message('b')));

    rerender({ ...options, isLoading: false });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ msg: 'content-a' }));
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['b']);
  });

  it('stays put while the queue is blocked', () => {
    const { result, rerender, onSubmit, options } = setup({
      isLoading: true,
      queueProcessingBlocked: true,
    });
    act(() => result.current.enqueue(message('a')));

    rerender({ ...options, isLoading: false, queueProcessingBlocked: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.queuedMessages).toHaveLength(1);
  });

  it('drains when the block lifts while idle', () => {
    const { result, rerender, onSubmit, options } = setup({ queueProcessingBlocked: true });
    act(() => result.current.enqueue(message('a')));

    rerender({ ...options, queueProcessingBlocked: false });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ msg: 'content-a' }));
  });
});

describe('interruptions', () => {
  it('stops the turn, pauses the queue and jumps the line', () => {
    const { result, onStop } = setup({ isLoading: true });
    act(() => result.current.enqueue(message('a')));
    act(() => result.current.enqueueInterruption(message('stop-now'), 'wait'));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['stop-now', 'a']);
    expect(result.current.isPaused).toBe(true);
  });

  it('sends the interruption when the turn ends but holds the rest', () => {
    const { result, rerender, onSubmit, options } = setup({ isLoading: true });
    act(() => result.current.enqueue(message('a')));
    act(() => result.current.enqueueInterruption(message('stop-now'), 'wait'));

    rerender({ ...options, isLoading: false });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ msg: 'content-stop-now' }));
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['a']);
    expect(result.current.isPaused).toBe(true);
  });

  it('a later plain message lifts the interruption pause', () => {
    const { result } = setup({ isLoading: true });
    act(() => result.current.enqueueInterruption(message('stop-now'), 'wait'));
    expect(result.current.isPaused).toBe(true);

    act(() => result.current.resumeAfterNonInterruption());
    expect(result.current.isPaused).toBe(false);
  });
});

describe('queue mutations', () => {
  it('removes, edits and reorders', () => {
    const { result } = setup({ isLoading: true });
    act(() => {
      result.current.enqueue(message('a'));
      result.current.enqueue(message('b'));
      result.current.enqueue(message('c'));
    });

    act(() => result.current.remove('b'));
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['a', 'c']);

    act(() => result.current.edit('a', 'edited'));
    expect(result.current.queuedMessages[0].content).toBe('edited');

    act(() => result.current.reorder([message('c'), message('a')]));
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['c', 'a']);

    act(() => result.current.clear());
    expect(result.current.queuedMessages).toHaveLength(0);
  });
});

describe('stopAndSend', () => {
  it('sends straight away when nothing is running', async () => {
    const { result, onSubmit } = setup();
    act(() => result.current.enqueue(message('a')));
    await act(async () => {
      await result.current.stopAndSend('a');
    });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ msg: 'content-a' }));
    expect(result.current.queuedMessages).toHaveLength(0);
  });

  it('steers into the running turn when the engine accepts', async () => {
    const onSteerQueuedMessage = vi.fn().mockResolvedValue(true);
    const { result, onSubmit, onStop } = setup({ isLoading: true, onSteerQueuedMessage });
    act(() => {
      result.current.enqueue(message('a'));
      result.current.enqueue(message('b'));
    });

    await act(async () => {
      await result.current.stopAndSend('b');
    });

    expect(onSteerQueuedMessage).toHaveBeenCalledWith(expect.objectContaining({ msg: 'content-b' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['a']);
  });

  it('falls back to stopping the turn when steering is refused', async () => {
    const onSteerQueuedMessage = vi.fn().mockResolvedValue(false);
    const { result, onStop } = setup({ isLoading: true, onSteerQueuedMessage });
    act(() => {
      result.current.enqueue(message('a'));
      result.current.enqueue(message('b'));
    });

    await act(async () => {
      await result.current.stopAndSend('b');
    });

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['b', 'a']);
    expect(result.current.isPaused).toBe(true);
  });

  it('sends the reserved message — not the head — once the turn stops', async () => {
    const onSteerQueuedMessage = vi.fn().mockResolvedValue(false);
    const { result, rerender, onSubmit, options } = setup({
      isLoading: true,
      onSteerQueuedMessage,
    });
    act(() => {
      result.current.enqueue(message('a'));
      result.current.enqueue(message('b'));
    });

    await act(async () => {
      await result.current.stopAndSend('b');
    });
    rerender({ ...options, isLoading: false, onSteerQueuedMessage });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ msg: 'content-b' }));
    expect(result.current.queuedMessages.map((m) => m.id)).toEqual(['a']);
  });

  it('ignores an unknown id', async () => {
    const { result, onSubmit } = setup();
    await act(async () => {
      await result.current.stopAndSend('missing');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('stop', () => {
  it('pauses the queue only when asked to', () => {
    const { result, onStop } = setup({ isLoading: true, pauseQueueOnStop: true });
    act(() => result.current.enqueue(message('a')));
    act(() => result.current.stop());
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(result.current.isPaused).toBe(true);
  });

  it('leaves the queue running by default', () => {
    const { result } = setup({ isLoading: true });
    act(() => result.current.enqueue(message('a')));
    act(() => result.current.stop());
    expect(result.current.isPaused).toBe(false);
  });
});

describe('resume', () => {
  it('clears the pause and sends the head', () => {
    const { result, onSubmit } = setup();
    act(() => result.current.enqueue(message('a')));
    act(() => result.current.enqueue(message('b')));

    act(() => result.current.resume());

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ msg: 'content-a' }));
    expect(result.current.isPaused).toBe(false);
  });

  it('only clears the pause while a turn is running', () => {
    const { result, onSubmit } = setup({ isLoading: true });
    act(() => result.current.enqueueInterruption(message('a'), 'wait'));

    act(() => result.current.resume());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.isPaused).toBe(false);
  });
});

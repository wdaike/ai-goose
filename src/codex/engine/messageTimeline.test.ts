import { describe, expect, it } from 'vitest';
import type { Message } from '../../types/message';
import {
  formatDuration,
  hasOnlyToolResponses,
  previousResolvedModel,
  resolvedModelOf,
  toolCallGroupDuration,
  workGroupDuration,
} from './messageTimeline';

const message = (
  created: number,
  role: 'user' | 'assistant',
  content: unknown[] = [],
  metadata: Record<string, unknown> = {}
): Message =>
  ({
    id: `m-${created}`,
    role,
    created,
    content,
    metadata: { userVisible: true, ...metadata },
  }) as unknown as Message;

const request = (id: string) => ({ type: 'toolRequest', id, toolCall: { name: 'x' } });
const response = (id: string) => ({ type: 'toolResponse', id, toolResult: { status: 'success' } });

describe('formatDuration', () => {
  it('shows plain seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('drops the seconds on a whole minute', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(120)).toBe('2m');
  });

  it('shows both parts otherwise', () => {
    expect(formatDuration(61)).toBe('1m 1s');
    expect(formatDuration(3599)).toBe('59m 59s');
  });
});

describe('toolCallGroupDuration', () => {
  it('runs until the response to the group request arrives', () => {
    const messages = [
      message(100, 'assistant', [request('t1')]),
      message(130, 'user', [response('t1')]),
      message(200, 'assistant', []),
    ];
    expect(toolCallGroupDuration(messages, [0])).toBe(100);
  });

  it('ignores responses belonging to another group', () => {
    const messages = [
      message(100, 'assistant', [request('t1')]),
      message(150, 'user', [response('other')]),
      message(180, 'user', []),
    ];
    // The foreign response does not extend the window, but the trailing user message ends it
    expect(toolCallGroupDuration(messages, [0])).toBe(1);
  });

  it('never reports less than a second', () => {
    expect(toolCallGroupDuration([message(100, 'assistant', [request('t1')])], [0])).toBe(1);
  });

  it('spans a multi-message group from its first entry', () => {
    const messages = [
      message(100, 'assistant', [request('t1')]),
      message(110, 'assistant', [request('t2')]),
      message(160, 'user', [response('t2')]),
      message(170, 'user', []),
    ];
    // Clock stops at the last response (160), not at the trailing user message
    expect(toolCallGroupDuration(messages, [0, 1])).toBe(60);
  });

  it('stops at a trailing assistant message and counts its timestamp', () => {
    const messages = [
      message(100, 'assistant', [request('t1')]),
      message(140, 'assistant', []),
      message(900, 'assistant', []),
    ];
    expect(toolCallGroupDuration(messages, [0])).toBe(40);
  });
});

describe('workGroupDuration', () => {
  it('extends across any responses, whatever their id', () => {
    const messages = [
      message(100, 'assistant', [request('t1')]),
      message(150, 'user', [response('unrelated')]),
      message(190, 'user', [response('also-unrelated')]),
      message(200, 'user', []),
    ];
    expect(workGroupDuration(messages, [0])).toBe(90);
  });

  it('stops at the first message with no responses', () => {
    const messages = [
      message(100, 'assistant', [request('t1')]),
      message(120, 'user', []),
      message(900, 'user', [response('t1')]),
    ];
    expect(workGroupDuration(messages, [0])).toBe(1);
  });

  it('counts a trailing assistant message before stopping', () => {
    const messages = [
      message(100, 'assistant', [request('t1')]),
      message(160, 'assistant', []),
      message(900, 'assistant', []),
    ];
    expect(workGroupDuration(messages, [0])).toBe(60);
  });
});

describe('resolvedModelOf', () => {
  it('reads the model off a visible assistant message', () => {
    expect(
      resolvedModelOf(message(1, 'assistant', [], { inference: { resolvedModel: 'gpt-x' } }))
    ).toBe('gpt-x');
  });

  it('ignores user messages', () => {
    expect(
      resolvedModelOf(message(1, 'user', [], { inference: { resolvedModel: 'gpt-x' } }))
    ).toBeNull();
  });

  it('ignores hidden messages', () => {
    expect(
      resolvedModelOf(
        message(1, 'assistant', [], { userVisible: false, inference: { resolvedModel: 'gpt-x' } })
      )
    ).toBeNull();
  });

  it('returns null when no inference metadata is attached', () => {
    expect(resolvedModelOf(message(1, 'assistant'))).toBeNull();
  });
});

describe('previousResolvedModel', () => {
  const messages = [
    message(1, 'assistant', [], { inference: { resolvedModel: 'model-a' } }),
    message(2, 'user'),
    message(3, 'assistant', [], { inference: { resolvedModel: 'model-b' } }),
  ];

  it('walks backwards past messages without a model', () => {
    expect(previousResolvedModel(messages, 2)).toBe('model-a');
  });

  it('returns null at the start of the conversation', () => {
    expect(previousResolvedModel(messages, 0)).toBeNull();
  });

  it('finds the nearest preceding model', () => {
    expect(previousResolvedModel(messages, 3)).toBe('model-b');
  });
});

describe('hasOnlyToolResponses', () => {
  it('is true for a pure response message', () => {
    expect(hasOnlyToolResponses(message(1, 'user', [response('a'), response('b')]))).toBe(true);
  });

  it('is false when any other content is mixed in', () => {
    expect(hasOnlyToolResponses(message(1, 'user', [response('a'), { type: 'text' }]))).toBe(false);
  });

  it('is vacuously true for an empty message', () => {
    expect(hasOnlyToolResponses(message(1, 'user', []))).toBe(true);
  });
});

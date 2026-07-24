import { describe, expect, it } from 'vitest';
import type { ThreadItem } from '../protocol/v2/ThreadItem';
import { mergeRolloutToolCalls, parseRolloutElements } from './restoreToolCalls';

const line = (payload: Record<string, unknown>) =>
  JSON.stringify({ timestamp: '2026-07-23T07:18:27.026Z', type: 'response_item', payload });

const rollout = [
  line({
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: '<environment_context>...</environment_context>' }],
  }),
  line({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'build it' }] }),
  line({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'Scaffolding the project.\n\n' }],
  }),
  line({
    type: 'function_call',
    name: 'exec_command',
    arguments: '{"cmd": "cargo init"}',
    call_id: 'call_1',
  }),
  line({ type: 'function_call_output', call_id: 'call_1', output: 'Process exited with code 0' }),
  line({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'Done.' }],
  }),
].join('\n');

const user = (id: string, text: string): ThreadItem =>
  ({
    id,
    type: 'userMessage',
    clientId: null,
    content: [{ type: 'text', text }],
  }) as unknown as ThreadItem;

const agent = (id: string, text: string): ThreadItem =>
  ({ id, type: 'agentMessage', text, phase: null }) as unknown as ThreadItem;

const reasoning = (id: string): ThreadItem =>
  ({ id, type: 'reasoning', summary: [], content: [] }) as unknown as ThreadItem;

describe('parseRolloutElements', () => {
  it('extracts user texts, assistant texts, and tool calls with outputs', () => {
    const elements = parseRolloutElements(rollout);

    expect(elements).toEqual([
      { kind: 'text', role: 'user', text: 'build it' },
      { kind: 'text', role: 'assistant', text: 'Scaffolding the project.\n\n' },
      {
        kind: 'tool',
        call: {
          callId: 'call_1',
          tool: 'exec_command',
          arguments: { cmd: 'cargo init' },
          output: 'Process exited with code 0',
        },
      },
      { kind: 'text', role: 'assistant', text: 'Done.' },
    ]);
  });
});

describe('mergeRolloutToolCalls', () => {
  it('splices tool calls between the restored messages they ran between', () => {
    const items = [
      user('u1', 'build it'),
      reasoning('r1'),
      agent('a1', 'Scaffolding the project.\n\n'),
      reasoning('r2'),
      agent('a2', 'Done.'),
    ];

    const merged = mergeRolloutToolCalls(items, parseRolloutElements(rollout));

    expect(merged.map((item) => item.id)).toEqual(['u1', 'r1', 'a1', 'call_1', 'r2', 'a2']);
    expect(merged[3]).toMatchObject({
      type: 'dynamicToolCall',
      tool: 'exec_command',
      arguments: { cmd: 'cargo init' },
      status: 'completed',
      contentItems: [{ type: 'inputText', text: 'Process exited with code 0' }],
    });
  });

  it('keeps unmatched restored items and skips unmatched rollout texts', () => {
    const items = [user('u1', 'build it'), agent('a1', 'Different text entirely')];

    const merged = mergeRolloutToolCalls(items, parseRolloutElements(rollout));

    expect(merged.map((item) => item.id)).toEqual(['u1', 'call_1', 'a1']);
  });
});

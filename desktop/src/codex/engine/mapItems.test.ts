import { describe, expect, it } from 'vitest';
import type { ThreadItem } from '../protocol/v2/ThreadItem';
import { mapThreadToMessages, type MappingState } from './mapItems';

function state(items: ThreadItem[]): MappingState {
  return {
    activeTurnId: null,
    items,
    streams: {},
    createdAt: new Map(),
    approvals: new Map(),
    turnPlans: new Map(),
  };
}

describe('mapThreadToMessages', () => {
  it('hides reasoning and groups commentary and tools while leaving the answer outside', () => {
    const items = [
      {
        type: 'userMessage',
        id: 'user-1',
        clientId: null,
        content: [{ type: 'text', text: 'Inspect the repository' }],
      },
      { type: 'reasoning', id: 'reasoning-1', summary: ['Looking around'], content: [] },
      {
        type: 'agentMessage',
        id: 'commentary-1',
        text: 'I am checking the main modules.',
        phase: 'commentary',
        memoryCitation: null,
      },
      {
        type: 'commandExecution',
        id: 'command-1',
        command: 'rg --files',
        cwd: '/repo',
        processId: null,
        source: 'agent',
        status: 'completed',
        commandActions: [
          {
            type: 'read',
            command: 'sed -n 1,80p src/main.ts',
            name: 'main.ts',
            path: '/repo/src/main.ts',
          },
        ],
        aggregatedOutput: 'src/main.ts',
        exitCode: 0,
        durationMs: 10,
      },
      { type: 'reasoning', id: 'reasoning-2', summary: ['Done'], content: [] },
      {
        type: 'agentMessage',
        id: 'answer-1',
        text: 'Here is the architecture.',
        phase: 'final_answer',
        memoryCitation: null,
      },
    ] as ThreadItem[];

    const messages = mapThreadToMessages(state(items));
    const byId = new Map(messages.map((message) => [message.id, message]));

    for (const id of ['commentary-1', 'command-1']) {
      expect(byId.get(id)?.metadata.workGroupId).toBe('work-user-1');
    }
    expect(byId.has('reasoning-1')).toBe(false);
    expect(byId.has('reasoning-2')).toBe(false);
    expect(byId.get('command-1')?.content[0]).toMatchObject({
      type: 'toolRequest',
      toolCall: {
        value: {
          arguments: {
            command_actions: [{ type: 'read', name: 'main.ts' }],
          },
        },
      },
    });
    expect(byId.get('answer-1')?.metadata.workGroupId).toBeUndefined();
  });

  it('keeps messages with an unknown phase compatible with the legacy layout', () => {
    const items = [
      {
        type: 'userMessage',
        id: 'user-1',
        clientId: null,
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        type: 'agentMessage',
        id: 'answer-1',
        text: 'Hello',
        phase: null,
        memoryCitation: null,
      },
    ] as ThreadItem[];

    const messages = mapThreadToMessages(state(items));

    expect(messages[1].metadata.workGroupId).toBeUndefined();
  });

  it('groups phase-less progress messages while leaving the last message as the answer', () => {
    const items = [
      {
        type: 'userMessage',
        id: 'user-1',
        clientId: null,
        content: [{ type: 'text', text: 'Analyze the project' }],
      },
      {
        type: 'agentMessage',
        id: 'progress-1',
        text: 'I will inspect the entry points.',
        phase: null,
        memoryCitation: null,
      },
      {
        type: 'agentMessage',
        id: 'answer-1',
        text: 'Here is the result.',
        phase: null,
        memoryCitation: null,
      },
    ] as ThreadItem[];

    const messages = mapThreadToMessages(state(items));

    expect(messages[1].metadata.workGroupId).toBe('work-user-1');
    expect(messages[2].metadata.workGroupId).toBeUndefined();
  });

  it('keeps a phase-less message inside the work group while the turn is active', () => {
    const mappingState = state([
      {
        type: 'userMessage',
        id: 'user-1',
        clientId: null,
        content: [{ type: 'text', text: 'Analyze the project' }],
      },
      {
        type: 'agentMessage',
        id: 'progress-1',
        text: 'I am inspecting the entry points.',
        phase: null,
        memoryCitation: null,
      },
    ] as ThreadItem[]);
    mappingState.activeTurnId = 'turn-1';

    const messages = mapThreadToMessages(mappingState);

    expect(messages[1].metadata.workGroupId).toBe('work-user-1');
  });

  it('maps dynamic exec calls into command activity within the work group', () => {
    const items = [
      {
        type: 'userMessage',
        id: 'user-1',
        clientId: null,
        content: [{ type: 'text', text: 'Inspect the repository' }],
      },
      {
        type: 'agentMessage',
        id: 'progress-1',
        text: 'I will inspect the source files.',
        phase: 'commentary',
        memoryCitation: null,
      },
      {
        type: 'dynamicToolCall',
        id: 'dynamic-1',
        namespace: 'functions',
        tool: 'exec',
        arguments: 'await tools.exec_command({ cmd: "rg --files" })',
        status: 'completed',
        contentItems: [{ type: 'inputText', text: 'src/main.ts' }],
        success: true,
        durationMs: 20,
      },
      {
        type: 'agentMessage',
        id: 'answer-1',
        text: 'Inspection complete.',
        phase: 'final_answer',
        memoryCitation: null,
      },
    ] as ThreadItem[];

    const messages = mapThreadToMessages(state(items));
    const command = messages.find((message) => message.id === 'dynamic-1');

    expect(command).toMatchObject({
      metadata: { workGroupId: 'work-user-1' },
      content: [
        {
          type: 'toolRequest',
          toolCall: {
            value: {
              name: 'shell',
              arguments: { command: 'await tools.exec_command({ cmd: "rg --files" })' },
            },
          },
        },
      ],
    });
  });

  it('places a structured turn plan inside the work group before the final answer', () => {
    const mappingState = state([
      {
        type: 'userMessage',
        id: 'user-1',
        clientId: null,
        content: [{ type: 'text', text: 'Analyze the project' }],
      },
      { type: 'reasoning', id: 'reasoning-1', summary: ['Starting'], content: [] },
      {
        type: 'agentMessage',
        id: 'answer-1',
        text: 'Analysis complete.',
        phase: 'final_answer',
        memoryCitation: null,
      },
    ] as ThreadItem[]);
    mappingState.turnPlans.set('turn-1', {
      explanation: 'Repository analysis',
      workGroupId: 'work-user-1',
      steps: [
        { step: 'Inspect entry points', status: 'completed' },
        { step: 'Trace dependencies', status: 'inProgress' },
      ],
    });

    const messages = mapThreadToMessages(mappingState);
    const planIndex = messages.findIndex((message) => message.id === 'plan-turn-1');
    const answerIndex = messages.findIndex((message) => message.id === 'answer-1');

    expect(planIndex).toBeLessThan(answerIndex);
    expect(messages[planIndex]).toMatchObject({
      metadata: { workGroupId: 'work-user-1' },
      content: [
        {
          type: 'plan',
          steps: [
            { step: 'Inspect entry points', status: 'completed' },
            { step: 'Trace dependencies', status: 'inProgress' },
          ],
        },
      ],
    });
  });
});

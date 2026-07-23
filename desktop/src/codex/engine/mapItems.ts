import type { Message, MessageContent } from '../../types/message';
import type { ThreadItem } from '../protocol/v2/ThreadItem';
import type { TurnPlanStep } from '../protocol/v2/TurnPlanStep';

export interface ItemStreams {
  agentText?: string;
  planText?: string;
  reasoningSummary?: string[];
  commandOutput?: string;
}

export interface PendingApprovalInfo {
  itemId: string;
  toolName: string;
  args: Record<string, unknown>;
  prompt?: string;
}

export interface TurnPlanInfo {
  explanation: string | null;
  steps: TurnPlanStep[];
  workGroupId: string;
}

export interface MappingState {
  activeTurnId: string | null;
  items: ThreadItem[];
  streams: Record<string, ItemStreams>;
  createdAt: Map<string, number>;
  approvals: Map<string, PendingApprovalInfo>;
  turnPlans: Map<string, TurnPlanInfo>;
}

const VISIBLE = { userVisible: true, agentVisible: true } as const;

const TOOL_ITEM_TYPES = new Set<string>([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'webSearch',
]);

function created(state: MappingState, itemId: string): number {
  let value = state.createdAt.get(itemId);
  if (value === undefined) {
    value = Math.floor(Date.now() / 1000);
    state.createdAt.set(itemId, value);
  }
  return value;
}

function assistantMessage(
  state: MappingState,
  id: string,
  content: MessageContent[],
  workGroupId?: string
): Message {
  return {
    id,
    role: 'assistant',
    created: created(state, id),
    content,
    metadata: { ...VISIBLE, ...(workGroupId ? { workGroupId } : {}) },
  };
}

function toolMessages(
  state: MappingState,
  item: ThreadItem & { id: string },
  toolName: string,
  args: Record<string, unknown>,
  result: { done: boolean; error?: string; output?: string },
  workGroupId?: string
): Message[] {
  const messages: Message[] = [
    assistantMessage(
      state,
      item.id,
      [
        {
          type: 'toolRequest',
          id: item.id,
          toolCall: { status: 'success', value: { name: toolName, arguments: args } },
        },
      ],
      workGroupId
    ),
  ];
  if (result.done) {
    messages.push({
      id: `${item.id}_result`,
      role: 'user',
      created: created(state, `${item.id}_result`),
      content: [
        {
          type: 'toolResponse',
          id: item.id,
          toolResult: result.error
            ? { status: 'error', error: result.error }
            : {
                status: 'success',
                value: {
                  content: result.output ? [{ type: 'text', text: result.output }] : [],
                  isError: false,
                },
              },
        },
      ],
      metadata: { ...VISIBLE },
    });
  }
  return messages;
}

function dynamicToolArguments(value: unknown, tool: string): Record<string, unknown> {
  const args =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { input: value };
  if (tool !== 'exec' && tool !== 'exec_command') return args;
  const command = typeof value === 'string' ? value : (args.input ?? args.cmd ?? args.command);
  return { command: typeof command === 'string' ? command : JSON.stringify(value) };
}

function mapItem(
  state: MappingState,
  item: ThreadItem,
  workGroupId?: string,
  agentMessageIsWork = false
): Message[] {
  const stream = state.streams[item.id];
  switch (item.type) {
    case 'userMessage': {
      const text = item.content
        .map((part) => {
          switch (part.type) {
            case 'text':
              return part.text;
            case 'skill':
              return `/${part.name}`;
            case 'mention':
              return `@${part.name}`;
            default:
              return '';
          }
        })
        .join('');
      if (!text) return [];
      const messageId = item.clientId ?? item.id;
      return [
        {
          id: messageId,
          role: 'user',
          created: created(state, messageId),
          content: [{ type: 'text', text }],
          metadata: { ...VISIBLE },
        },
      ];
    }
    case 'agentMessage': {
      const text = item.text || stream?.agentText || '';
      if (!text) return [];
      return [
        assistantMessage(
          state,
          item.id,
          [{ type: 'text', text }],
          item.phase === 'commentary' || agentMessageIsWork ? workGroupId : undefined
        ),
      ];
    }
    case 'plan': {
      const text = item.text || stream?.planText || '';
      if (!text) return [];
      return [assistantMessage(state, item.id, [{ type: 'text', text }])];
    }
    case 'reasoning': {
      return [];
    }
    case 'commandExecution': {
      const done = item.status !== 'inProgress';
      const output = item.aggregatedOutput ?? stream?.commandOutput ?? '';
      return toolMessages(
        state,
        item,
        'shell',
        { command: item.command, command_actions: item.commandActions },
        {
          done,
          error: item.status === 'failed' && !output ? '命令执行失败' : undefined,
          output,
        },
        workGroupId
      );
    }
    case 'fileChange': {
      const done = item.status !== 'inProgress';
      const diff = item.changes.map((change) => change.diff).join('\n');
      return toolMessages(
        state,
        item,
        'edit_file',
        { files: item.changes.map((change) => `${change.kind.type} ${change.path}`) },
        { done, output: diff },
        workGroupId
      );
    }
    case 'mcpToolCall': {
      const done = item.status !== 'inProgress';
      const resultText = (item.result?.content ?? [])
        .map((block) => {
          const candidate = block as { type?: string; text?: string } | null;
          return candidate?.type === 'text' && typeof candidate.text === 'string'
            ? candidate.text
            : '';
        })
        .filter(Boolean)
        .join('\n');
      return toolMessages(
        state,
        item,
        `${item.server}__${item.tool}`,
        (item.arguments ?? {}) as Record<string, unknown>,
        { done, error: item.error?.message, output: resultText },
        workGroupId
      );
    }
    case 'dynamicToolCall': {
      const output = (item.contentItems ?? [])
        .filter((content) => content.type === 'inputText')
        .map((content) => content.text)
        .join('\n');
      const isCommand = item.tool === 'exec' || item.tool === 'exec_command';
      const isFileChange = item.tool === 'apply_patch';
      const toolName = isCommand
        ? 'shell'
        : isFileChange
          ? 'edit_file'
          : item.namespace
            ? `${item.namespace}__${item.tool}`
            : item.tool;
      return toolMessages(
        state,
        item,
        toolName,
        dynamicToolArguments(item.arguments, item.tool),
        {
          done: item.status !== 'inProgress',
          error:
            item.status === 'failed' || item.success === false
              ? output || 'Tool call failed'
              : undefined,
          output,
        },
        workGroupId
      );
    }
    case 'webSearch':
      return toolMessages(
        state,
        item,
        'web_search',
        { query: item.query },
        { done: true },
        workGroupId
      );
    default:
      return [];
  }
}

export function mapThreadToMessages(state: MappingState): Message[] {
  let workGroupId: string | undefined;
  const messages: Message[] = [];
  const emittedPlanIds = new Set<string>();
  const plansByWorkGroup = new Map<string, [string, TurnPlanInfo]>();
  for (const plan of state.turnPlans) {
    plansByWorkGroup.set(plan[1].workGroupId, plan);
  }
  const emitPlan = (groupId: string | undefined) => {
    if (!groupId) return;
    const plan = plansByWorkGroup.get(groupId);
    if (!plan || emittedPlanIds.has(plan[0]) || plan[1].steps.length === 0) return;
    emittedPlanIds.add(plan[0]);
    messages.push(
      assistantMessage(
        state,
        `plan-${plan[0]}`,
        [
          {
            type: 'plan',
            explanation: plan[1].explanation,
            steps: plan[1].steps,
          },
        ],
        groupId
      )
    );
  };

  // For models that never set message phases, texts followed by tool activity in
  // the same turn are progress commentary; texts after the last tool call are the
  // final answer. Restored threads can lack tool items entirely (codex does not
  // reconstruct dynamic tool calls from rollout history), in which case nothing
  // is grouped and the turn renders flat.
  const fallbackWorkMessageIds = new Set<string>();
  let segmentStart = 0;
  const markFallbackWork = (segmentEnd: number, isActive: boolean) => {
    const segment = state.items.slice(segmentStart, segmentEnd);
    if (
      !isActive &&
      segment.some((item) => item.type === 'agentMessage' && item.phase === 'final_answer')
    ) {
      return;
    }
    let lastToolOffset = -1;
    segment.forEach((item, offset) => {
      if (TOOL_ITEM_TYPES.has(item.type)) lastToolOffset = offset;
    });
    segment.forEach((item, offset) => {
      if (item.type !== 'agentMessage' || item.phase !== null) return;
      if (isActive || offset < lastToolOffset) fallbackWorkMessageIds.add(item.id);
    });
  };

  state.items.forEach((item, index) => {
    if (item.type !== 'userMessage' || index === 0) return;
    markFallbackWork(index, false);
    segmentStart = index;
  });
  markFallbackWork(state.items.length, Boolean(state.activeTurnId));

  for (const item of state.items) {
    if (item.type === 'userMessage') {
      workGroupId = `work-${item.clientId ?? item.id}`;
    }
    if (item.type === 'agentMessage' && item.phase === 'final_answer') {
      emitPlan(workGroupId);
    }
    messages.push(
      ...mapItem(
        state,
        item,
        workGroupId,
        item.type === 'agentMessage' && item.phase === null && fallbackWorkMessageIds.has(item.id)
      )
    );
  }

  for (const [turnId, plan] of state.turnPlans) {
    if (!emittedPlanIds.has(turnId)) emitPlan(plan.workGroupId);
  }

  for (const approval of state.approvals.values()) {
    messages.push({
      id: `acp_permission_${approval.itemId}`,
      role: 'assistant',
      created: created(state, `acp_permission_${approval.itemId}`),
      content: [
        {
          type: 'actionRequired',
          data: {
            actionType: 'toolConfirmation',
            id: approval.itemId,
            toolName: approval.toolName,
            arguments: approval.args,
            ...(approval.prompt ? { prompt: approval.prompt } : {}),
          },
        },
      ],
      metadata: { ...VISIBLE },
    });
  }

  return messages;
}

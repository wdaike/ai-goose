import type { Message, MessageContent } from '../../types/message';
import type { ThreadItem } from '../protocol/v2/ThreadItem';

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

export interface MappingState {
  items: ThreadItem[];
  streams: Record<string, ItemStreams>;
  createdAt: Map<string, number>;
  approvals: Map<string, PendingApprovalInfo>;
}

const VISIBLE = { userVisible: true, agentVisible: true } as const;

function created(state: MappingState, itemId: string): number {
  let value = state.createdAt.get(itemId);
  if (value === undefined) {
    value = Math.floor(Date.now() / 1000);
    state.createdAt.set(itemId, value);
  }
  return value;
}

function assistantMessage(state: MappingState, id: string, content: MessageContent[]): Message {
  return { id, role: 'assistant', created: created(state, id), content, metadata: { ...VISIBLE } };
}

function toolMessages(
  state: MappingState,
  item: ThreadItem & { id: string },
  toolName: string,
  args: Record<string, unknown>,
  result: { done: boolean; error?: string; output?: string }
): Message[] {
  const messages: Message[] = [
    assistantMessage(state, item.id, [
      {
        type: 'toolRequest',
        id: item.id,
        toolCall: { status: 'success', value: { name: toolName, arguments: args } },
      },
    ]),
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

function mapItem(state: MappingState, item: ThreadItem): Message[] {
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
      return [assistantMessage(state, item.id, [{ type: 'text', text }])];
    }
    case 'plan': {
      const text = item.text || stream?.planText || '';
      if (!text) return [];
      return [assistantMessage(state, item.id, [{ type: 'text', text }])];
    }
    case 'reasoning': {
      const summary = item.summary.length ? item.summary : (stream?.reasoningSummary ?? []);
      const text = summary.filter(Boolean).join('\n\n');
      if (!text) return [];
      return [
        assistantMessage(state, item.id, [{ type: 'thinking', thinking: text, signature: '' }]),
      ];
    }
    case 'commandExecution': {
      const done = item.status !== 'inProgress';
      const output = item.aggregatedOutput ?? stream?.commandOutput ?? '';
      return toolMessages(
        state,
        item,
        'shell',
        { command: item.command },
        {
          done,
          error: item.status === 'failed' && !output ? '命令执行失败' : undefined,
          output,
        }
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
        { done, output: diff }
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
        { done, error: item.error?.message, output: resultText }
      );
    }
    case 'webSearch':
      return toolMessages(state, item, 'web_search', { query: item.query }, { done: true });
    default:
      return [];
  }
}

export function mapThreadToMessages(state: MappingState): Message[] {
  const messages = state.items.flatMap((item) => mapItem(state, item));

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

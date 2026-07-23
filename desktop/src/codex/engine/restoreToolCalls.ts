import type { ThreadItem } from '../protocol/v2/ThreadItem';
import { codex } from '../client';

/**
 * codex `thread/read` does not reconstruct dynamic tool calls from rollout
 * history, so restored threads lose their command activity. The rollout file
 * on disk still records every `function_call`, so we re-read it through
 * codex's own `fs/readFile` and splice synthetic dynamicToolCall items back
 * between the restored messages.
 */

interface RolloutToolCall {
  callId: string;
  tool: string;
  arguments: unknown;
  output: string;
}

type RolloutElement =
  | { kind: 'text'; role: 'user' | 'assistant'; text: string }
  | { kind: 'tool'; call: RolloutToolCall };

const TOOL_ITEM_TYPES = new Set<string>([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'webSearch',
]);

function contentText(content: unknown, type: string): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const candidate = part as { type?: string; text?: string } | null;
      return candidate?.type === type && typeof candidate.text === 'string' ? candidate.text : '';
    })
    .join('');
}

export function parseRolloutElements(rollout: string): RolloutElement[] {
  const elements: RolloutElement[] = [];
  const callsById = new Map<string, RolloutToolCall>();

  for (const line of rollout.split('\n')) {
    if (!line.trim()) continue;
    let entry: { type?: string; payload?: Record<string, unknown> };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'response_item' || !entry.payload) continue;
    const payload = entry.payload;

    switch (payload.type) {
      case 'message': {
        const role = payload.role;
        if (role !== 'user' && role !== 'assistant') break;
        const text =
          role === 'user'
            ? contentText(payload.content, 'input_text')
            : contentText(payload.content, 'output_text');
        // Skip synthetic wrappers such as <environment_context> or <turn_aborted>.
        if (!text.trim() || text.trimStart().startsWith('<')) break;
        elements.push({ kind: 'text', role, text });
        break;
      }
      case 'function_call': {
        const callId = typeof payload.call_id === 'string' ? payload.call_id : null;
        const tool = typeof payload.name === 'string' ? payload.name : null;
        if (!callId || !tool) break;
        let args: unknown = payload.arguments;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            // keep the raw string
          }
        }
        const call: RolloutToolCall = { callId, tool, arguments: args, output: '' };
        callsById.set(callId, call);
        elements.push({ kind: 'tool', call });
        break;
      }
      case 'function_call_output': {
        const callId = typeof payload.call_id === 'string' ? payload.call_id : null;
        const call = callId ? callsById.get(callId) : undefined;
        if (call && typeof payload.output === 'string') call.output = payload.output;
        break;
      }
    }
  }

  return elements;
}

function syntheticToolItem(call: RolloutToolCall): ThreadItem {
  return {
    type: 'dynamicToolCall',
    id: call.callId,
    namespace: null,
    tool: call.tool,
    arguments: call.arguments as never,
    status: 'completed',
    contentItems: call.output ? [{ type: 'inputText', text: call.output }] : null,
    success: null,
    durationMs: null,
  };
}

function normalize(text: string): string {
  return text.trim();
}

function matches(item: ThreadItem, element: { role: 'user' | 'assistant'; text: string }): boolean {
  if (element.role === 'assistant') {
    return item.type === 'agentMessage' && normalize(item.text) === normalize(element.text);
  }
  if (item.type !== 'userMessage') return false;
  const text = item.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('');
  return normalize(text) === normalize(element.text);
}

export function mergeRolloutToolCalls(items: ThreadItem[], elements: RolloutElement[]): ThreadItem[] {
  const merged: ThreadItem[] = [];
  let cursor = 0;

  for (const element of elements) {
    if (element.kind === 'tool') {
      merged.push(syntheticToolItem(element.call));
      continue;
    }
    let matchIndex = -1;
    for (let i = cursor; i < items.length; i++) {
      if (matches(items[i], element)) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex === -1) continue;
    merged.push(...items.slice(cursor, matchIndex + 1));
    cursor = matchIndex + 1;
  }

  merged.push(...items.slice(cursor));
  return merged;
}

export async function restoreDynamicToolCalls(
  rolloutPath: string | null,
  items: ThreadItem[]
): Promise<ThreadItem[]> {
  if (!rolloutPath || items.some((item) => TOOL_ITEM_TYPES.has(item.type))) return items;
  try {
    const { dataBase64 } = await codex.fsReadFile({ path: rolloutPath });
    const bytes = Uint8Array.from(window.atob(dataBase64), (char) => char.charCodeAt(0));
    const rollout = new TextDecoder().decode(bytes);
    const elements = parseRolloutElements(rollout);
    if (!elements.some((element) => element.kind === 'tool')) return items;
    return mergeRolloutToolCalls(items, elements);
  } catch (error) {
    console.warn('Failed to restore tool calls from rollout:', error);
    return items;
  }
}

import { describe, expect, it } from 'vitest';
import type { NotificationEvent, ToolResponseMessageContent } from '../../types/message';
import {
  countSubagentLogs,
  formatSubagentToolCall,
  getExtensionTooltip,
  getSubagentSessionId,
  getToolName,
  getToolResultContent,
  isSubagentToolRequestData,
  logToString,
  notificationToProgress,
  parseSubagentLog,
  splitQualifiedToolName,
} from './toolPresentation';

const notification = (data: unknown, method = 'notifications/message'): NotificationEvent =>
  ({
    type: 'Notification',
    request_id: 'req-1',
    message: { method, params: { data } },
  }) as unknown as NotificationEvent;

const successResponse = (value: unknown): ToolResponseMessageContent =>
  ({
    type: 'toolResponse',
    id: 'tool-1',
    toolResult: { status: 'success', value },
  }) as unknown as ToolResponseMessageContent;

describe('splitQualifiedToolName', () => {
  it('splits on the last double underscore', () => {
    expect(splitQualifiedToolName('developer__shell')).toEqual({
      extensionName: 'developer',
      toolName: 'shell',
    });
  });

  it('keeps earlier separators inside the extension name', () => {
    expect(splitQualifiedToolName('mcp__github__create_issue')).toEqual({
      extensionName: 'mcp__github',
      toolName: 'create_issue',
    });
  });

  it('treats an unqualified name as having no extension', () => {
    expect(splitQualifiedToolName('shell')).toEqual({ extensionName: null, toolName: 'shell' });
  });

  it('reports no extension when the name only starts with the separator', () => {
    expect(splitQualifiedToolName('__shell')).toEqual({ extensionName: null, toolName: 'shell' });
  });

  it('yields an empty tool name for a trailing separator', () => {
    expect(splitQualifiedToolName('developer__')).toEqual({
      extensionName: 'developer',
      toolName: '',
    });
  });
});

describe('getToolName / getExtensionTooltip', () => {
  it('returns the bare tool name', () => {
    expect(getToolName('developer__shell')).toBe('shell');
    expect(getToolName('shell')).toBe('shell');
  });

  it('builds a tooltip only when an extension is present', () => {
    expect(getExtensionTooltip('developer__shell')).toBe('developer extension');
    expect(getExtensionTooltip('shell')).toBeNull();
    expect(getExtensionTooltip('__shell')).toBeNull();
  });
});

describe('isSubagentToolRequestData', () => {
  const valid = {
    type: 'subagent_tool_request',
    subagent_id: 'agent_abc',
    tool_call: { name: 'developer__shell' },
  };

  it('accepts a well-formed payload', () => {
    expect(isSubagentToolRequestData(valid)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'subagent_tool_request'],
    ['a wrong type tag', { ...valid, type: 'other' }],
    ['a non-string id', { ...valid, subagent_id: 42 }],
    ['a missing tool_call', { type: 'subagent_tool_request', subagent_id: 'a' }],
    ['a tool_call without a name', { ...valid, tool_call: {} }],
  ])('rejects %s', (_label, input) => {
    expect(isSubagentToolRequestData(input)).toBe(false);
  });
});

describe('formatSubagentToolCall', () => {
  it('shortens the id and separates the extension', () => {
    expect(
      formatSubagentToolCall({
        type: 'subagent_tool_request',
        subagent_id: 'subagent_run_7f3a',
        tool_call: { name: 'developer__shell' },
      })
    ).toBe('[subagent:7f3a] shell | developer');
  });

  it('omits the separator when the tool is unqualified', () => {
    expect(
      formatSubagentToolCall({
        type: 'subagent_tool_request',
        subagent_id: 'abc',
        tool_call: { name: 'shell' },
      })
    ).toBe('[subagent:abc] shell');
  });

  it('falls back to "unknown" for an empty tool name', () => {
    expect(
      formatSubagentToolCall({
        type: 'subagent_tool_request',
        subagent_id: 'abc',
        tool_call: { name: 'developer__' },
      })
    ).toBe('[subagent:abc] unknown | developer');
  });
});

describe('logToString', () => {
  it('formats a subagent tool request', () => {
    expect(
      logToString(
        notification({
          type: 'subagent_tool_request',
          subagent_id: 'run_9z',
          tool_call: { name: 'github__create_issue' },
        })
      )
    ).toBe('[subagent:9z] create_issue | github');
  });

  it('prefixes shell output with its stream', () => {
    expect(logToString(notification({ stream: 'stderr', output: 'boom' }))).toBe('[stderr] boom');
  });

  it('passes a plain string through', () => {
    expect(logToString(notification('hello'))).toBe('hello');
  });

  it('serializes anything else', () => {
    expect(logToString(notification({ a: 1 }))).toBe('{"a":1}');
  });

  it('falls back to serialization when the subagent payload is malformed', () => {
    expect(logToString(notification({ type: 'subagent_tool_request', subagent_id: 7 }))).toBe(
      '{"type":"subagent_tool_request","subagent_id":7}'
    );
  });
});

describe('notificationToProgress', () => {
  it('unwraps the params envelope', () => {
    const event = {
      type: 'Notification',
      request_id: 'r',
      message: { method: 'notifications/progress', params: { progress: 3, total: 10 } },
    } as unknown as NotificationEvent;
    expect(notificationToProgress(event)).toEqual({ progress: 3, total: 10 });
  });
});

describe('parseSubagentLog', () => {
  it('returns null for a non-subagent line', () => {
    expect(parseSubagentLog('[stderr] boom')).toBeNull();
  });

  it('splits tool and extension', () => {
    expect(parseSubagentLog('[subagent:7f3a] shell | developer')).toEqual({
      toolName: 'shell',
      extensionName: 'developer',
      detail: undefined,
    });
  });

  it('leaves the extension undefined when absent', () => {
    expect(parseSubagentLog('[subagent:7f3a] shell')).toEqual({
      toolName: 'shell',
      extensionName: undefined,
      detail: undefined,
    });
  });

  it('keeps trailing lines as detail', () => {
    expect(parseSubagentLog('[subagent:7f3a] shell | developer\nline1\nline2')).toEqual({
      toolName: 'shell',
      extensionName: 'developer',
      detail: 'line1\nline2',
    });
  });
});

describe('countSubagentLogs', () => {
  it('counts only subagent-prefixed entries', () => {
    expect(countSubagentLogs(['[subagent:a] x', '[stderr] y', '[subagent:b] z'])).toBe(2);
  });

  it('returns zero for an empty list', () => {
    expect(countSubagentLogs([])).toBe(0);
  });
});

describe('getSubagentSessionId', () => {
  it('reads the id off a successful result', () => {
    expect(getSubagentSessionId(successResponse({ _meta: { subagent_session_id: 's-1' } }))).toBe(
      's-1'
    );
  });

  it('falls back to notifications when the turn was cancelled mid-stream', () => {
    expect(
      getSubagentSessionId(undefined, [
        notification({ type: 'other' }),
        notification({ type: 'subagent_tool_request', subagent_id: 's-2' }),
      ])
    ).toBe('s-2');
  });

  it('ignores notifications sent under a different method', () => {
    expect(
      getSubagentSessionId(undefined, [
        notification({ type: 'subagent_tool_request', subagent_id: 's-3' }, 'notifications/other'),
      ])
    ).toBeNull();
  });

  it('returns null when nothing carries an id', () => {
    expect(getSubagentSessionId(undefined, [])).toBeNull();
    expect(getSubagentSessionId(successResponse({ _meta: {} }))).toBeNull();
  });
});

describe('getToolResultContent', () => {
  it('returns nothing for a failed result', () => {
    expect(getToolResultContent({ status: 'error', error: 'boom' })).toEqual([]);
  });

  it('keeps blocks with no audience annotation', () => {
    const block = { type: 'text', text: 'hi' };
    expect(getToolResultContent({ status: 'success', value: { content: [block] } })).toEqual([
      block,
    ]);
  });

  it('drops blocks addressed only to the assistant', () => {
    const forUser = { type: 'text', text: 'shown', annotations: { audience: ['user'] } };
    const forModel = { type: 'text', text: 'hidden', annotations: { audience: ['assistant'] } };
    expect(
      getToolResultContent({ status: 'success', value: { content: [forUser, forModel] } })
    ).toEqual([forUser]);
  });
});

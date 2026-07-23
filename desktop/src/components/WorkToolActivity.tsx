import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, ChevronRight, Pencil, Search, Wrench } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import type { Message } from '../types/message';
import { getToolRequests } from '../types/message';
import { cn } from '../utils';
import { Terminal } from './icons/toolcalls';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

const i18n = defineMessages({
  readFiles: {
    id: 'workToolActivity.readFiles',
    defaultMessage: 'Read files',
  },
  listedFiles: {
    id: 'workToolActivity.listedFiles',
    defaultMessage: 'Listed files',
  },
  searchedFiles: {
    id: 'workToolActivity.searchedFiles',
    defaultMessage: 'Searched files',
  },
  editedFiles: {
    id: 'workToolActivity.editedFiles',
    defaultMessage: 'Edited files',
  },
  searchedWeb: {
    id: 'workToolActivity.searchedWeb',
    defaultMessage: 'Searched the web',
  },
  ranCommands: {
    id: 'workToolActivity.ranCommands',
    defaultMessage: 'Ran {count, plural, one {a command} other {# commands}}',
  },
  usedTools: {
    id: 'workToolActivity.usedTools',
    defaultMessage: 'Used {count, plural, one {a tool} other {# tools}}',
  },
});

export type WorkToolKind =
  | 'readFiles'
  | 'listedFiles'
  | 'searchedFiles'
  | 'editedFiles'
  | 'searchedWeb'
  | 'ranCommands'
  | 'usedTools';

interface ToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

function getToolCall(message: Message): ToolCall | null {
  const request = getToolRequests(message)[0];
  if (!request) return null;
  const value = request.toolCall as Record<string, unknown>;
  const toolCall = value.status === 'success' ? value.value : value;
  if (!toolCall || typeof toolCall !== 'object') return null;
  const candidate = toolCall as Record<string, unknown>;
  if (typeof candidate.name !== 'string') return null;
  return {
    name: candidate.name,
    arguments:
      candidate.arguments && typeof candidate.arguments === 'object'
        ? (candidate.arguments as Record<string, unknown>)
        : undefined,
  };
}

function shortToolName(name: string): string {
  const separator = name.lastIndexOf('__');
  return separator === -1 ? name : name.slice(separator + 2);
}

export function getWorkToolKinds(messages: Message[]): Map<WorkToolKind, number> {
  const kinds = new Map<WorkToolKind, number>();
  const add = (kind: WorkToolKind) => kinds.set(kind, (kinds.get(kind) ?? 0) + 1);

  for (const message of messages) {
    const toolCall = getToolCall(message);
    if (!toolCall) continue;
    const name = shortToolName(toolCall.name);

    if (name === 'shell') {
      const actions = Array.isArray(toolCall.arguments?.command_actions)
        ? toolCall.arguments.command_actions
        : [];
      if (actions.length === 0) {
        add('ranCommands');
        continue;
      }

      let recognized = false;
      for (const action of actions) {
        if (!action || typeof action !== 'object' || !('type' in action)) continue;
        switch (action.type) {
          case 'read':
            add('readFiles');
            recognized = true;
            break;
          case 'listFiles':
            add('listedFiles');
            recognized = true;
            break;
          case 'search':
            add('searchedFiles');
            recognized = true;
            break;
          case 'unknown':
            add('ranCommands');
            recognized = true;
            break;
        }
      }
      if (!recognized) add('ranCommands');
      continue;
    }

    if (name === 'edit_file' || name === 'text_editor' || name === 'update_file') {
      add('editedFiles');
    } else if (name === 'read_files' || name === 'read') {
      add('readFiles');
    } else if (name === 'list_files') {
      add('listedFiles');
    } else if (name === 'search_files' || name === 'search') {
      add('searchedFiles');
    } else if (name === 'web_search' || name === 'webSearch') {
      add('searchedWeb');
    } else {
      add('usedTools');
    }
  }

  return kinds;
}

interface WorkToolActivityProps {
  children: ReactNode;
  forceExpanded: boolean;
  messages: Message[];
}

export default function WorkToolActivity({
  children,
  forceExpanded,
  messages,
}: WorkToolActivityProps) {
  const intl = useIntl();
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);
  const kinds = useMemo(() => getWorkToolKinds(messages), [messages]);
  const isExpanded = forceExpanded || (manualToggle ?? false);
  const labels = [...kinds].map(([kind, count]) => intl.formatMessage(i18n[kind], { count }));
  const Icon = kinds.has('editedFiles')
    ? Pencil
    : kinds.has('readFiles') || kinds.has('listedFiles')
      ? BookOpen
      : kinds.has('searchedFiles') || kinds.has('searchedWeb')
        ? Search
        : kinds.has('ranCommands')
          ? Terminal
          : Wrench;

  return (
    <Collapsible open={isExpanded} onOpenChange={setManualToggle}>
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{labels.join(', ')}</span>
        <ChevronRight
          className={cn('h-4 w-4 shrink-0 transition-transform', isExpanded && 'rotate-90')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pl-6">
        <div className="flex flex-col gap-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

import { useState } from 'react';
import { ChevronDown, FileDiff, FileText } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { cn } from '../utils';

const i18n = defineMessages({
  editedFiles: {
    id: 'fileChangeCard.editedFiles',
    defaultMessage: 'Edited {count, plural, one {1 file} other {# files}}',
  },
  review: {
    id: 'fileChangeCard.review',
    defaultMessage: 'Review',
  },
  showMoreFiles: {
    id: 'fileChangeCard.showMoreFiles',
    defaultMessage: 'Show {count} more files',
  },
  showMore: {
    id: 'fileChangeCard.showMore',
    defaultMessage: 'Show {count} more',
  },
  document: {
    id: 'fileChangeCard.document',
    defaultMessage: 'Document',
  },
  openIn: {
    id: 'fileChangeCard.openIn',
    defaultMessage: 'Open in',
  },
});

export interface StructuredFileChange {
  path: string;
  kind: 'add' | 'delete' | 'update';
  added: number;
  removed: number;
  diff: string;
}

const COLLAPSED_FILE_COUNT = 3;

export function getStructuredFileChanges(toolCall: {
  name: string;
  arguments: Record<string, unknown>;
}): StructuredFileChange[] | null {
  if (toolCall.name !== 'edit_file') return null;
  const raw = toolCall.arguments?.file_changes;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const changes: StructuredFileChange[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.path !== 'string') return null;
    changes.push({
      path: candidate.path,
      kind: candidate.kind === 'add' || candidate.kind === 'delete' ? candidate.kind : 'update',
      added: typeof candidate.added === 'number' ? candidate.added : 0,
      removed: typeof candidate.removed === 'number' ? candidate.removed : 0,
      diff: typeof candidate.diff === 'string' ? candidate.diff : '',
    });
  }
  return changes;
}

function splitPath(path: string): { dir: string; name: string } {
  const normalized = path.replace(/\\/g, '/');
  const separator = normalized.lastIndexOf('/');
  if (separator === -1) return { dir: '', name: normalized };
  return { dir: normalized.slice(0, separator + 1), name: normalized.slice(separator + 1) };
}

function DiffCounts({ added, removed, className }: { added: number; removed: number; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 font-medium tabular-nums', className)}>
      <span className="text-green-600 dark:text-green-500">+{added}</span>
      <span className="text-red-600 dark:text-red-500">-{removed}</span>
    </span>
  );
}

function openFile(path: string) {
  void window.electron.openExternal(`file://${encodeURI(path)}`);
}

/** ChatGPT-Codex-style deliverable card for markdown documents the agent wrote. */
function DocumentCards({ changes }: { changes: StructuredFileChange[] }) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? changes : changes.slice(0, COLLAPSED_FILE_COUNT);
  const hiddenCount = changes.length - visible.length;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border-primary bg-background-primary">
      {visible.map((change, index) => {
        const { name } = splitPath(change.path);
        const extension = name.split('.').pop()?.toUpperCase() ?? '';
        return (
          <div
            key={change.path}
            className={cn(
              'flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-background-secondary/60',
              index > 0 && 'border-t border-border-primary/60'
            )}
            onClick={() => openFile(change.path)}
          >
            <span className="flex size-12 flex-shrink-0 items-center justify-center rounded-xl bg-background-tertiary">
              <FileText className="size-5 text-text-secondary" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium text-text-primary">{name}</div>
              <div className="text-sm text-text-secondary">
                {intl.formatMessage(i18n.document)} · {extension}
              </div>
            </div>
            <button
              onClick={(event) => {
                event.stopPropagation();
                openFile(change.path);
              }}
              className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-border-primary px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-background-tertiary/60"
            >
              {intl.formatMessage(i18n.openIn)}
              <ChevronDown className="size-3.5 text-text-secondary" />
            </button>
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-1 border-t border-border-primary/60 px-5 py-3 text-sm text-text-secondary transition-colors hover:bg-background-secondary/60 hover:text-text-primary"
        >
          {intl.formatMessage(i18n.showMore, { count: hiddenCount })}
          <ChevronDown className="size-4" />
        </button>
      )}
    </div>
  );
}

interface FileChangeCardProps {
  changes: StructuredFileChange[];
}

/**
 * ChatGPT-Codex-style summary card for a fileChange item: "Edited N files"
 * header with aggregate +/- counts and a Review toggle revealing per-file
 * diffs, followed by per-file rows (dir path, bold filename, diff counts).
 */
export default function FileChangeCard({ changes }: FileChangeCardProps) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const isDocumentDelivery =
    changes.length > 0 && changes.every((change) => /\.mdx?$/i.test(change.path));
  if (isDocumentDelivery) {
    return <DocumentCards changes={changes} />;
  }

  const totalAdded = changes.reduce((sum, change) => sum + change.added, 0);
  const totalRemoved = changes.reduce((sum, change) => sum + change.removed, 0);
  const visible = expanded ? changes : changes.slice(0, COLLAPSED_FILE_COUNT);
  const hiddenCount = changes.length - visible.length;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border-primary bg-background-primary">
      <div className="flex items-center gap-4 px-5 py-4">
        <span className="flex size-12 flex-shrink-0 items-center justify-center rounded-xl bg-background-tertiary">
          <FileDiff className="size-5 text-text-secondary" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-text-primary">
            {intl.formatMessage(i18n.editedFiles, { count: changes.length })}
          </div>
          <DiffCounts added={totalAdded} removed={totalRemoved} className="text-sm" />
        </div>
        <button
          onClick={() => setReviewOpen((open) => !open)}
          className={cn(
            'flex-shrink-0 rounded-lg border border-border-primary px-4 py-1.5 text-sm font-medium transition-colors',
            reviewOpen
              ? 'bg-background-tertiary text-text-primary'
              : 'text-text-primary hover:bg-background-tertiary/60'
          )}
        >
          {intl.formatMessage(i18n.review)}
        </button>
      </div>

      <div className="border-t border-border-primary/60 py-1">
        {visible.map((change) => {
          const { dir, name } = splitPath(change.path);
          return (
            <div key={change.path} className="flex flex-col">
              <div
                className="flex cursor-pointer items-center gap-4 px-5 py-1.5 text-sm transition-colors hover:bg-background-secondary/60"
                onClick={() => openFile(change.path)}
              >
                <span className="min-w-0 flex-1 truncate text-text-primary" title={change.path}>
                  {dir}
                  <span className="font-semibold">{name}</span>
                </span>
                <DiffCounts added={change.added} removed={change.removed} />
              </div>
              {reviewOpen && change.diff && (
                <pre className="mx-5 my-1.5 max-h-72 overflow-auto rounded-lg bg-background-secondary p-3 font-mono text-xs text-text-primary">
                  {change.diff.trim()}
                </pre>
              )}
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 px-5 py-2 text-sm text-text-primary transition-colors hover:text-text-secondary"
          >
            {intl.formatMessage(i18n.showMoreFiles, { count: hiddenCount })}
            <ChevronDown className="size-4 text-text-secondary" />
          </button>
        )}
      </div>
    </div>
  );
}

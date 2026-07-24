/* global ClipboardItem */

import React, { useState } from 'react';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { cn } from '../utils';

const i18n = defineMessages({
  copy: {
    id: 'messageActions.copy',
    defaultMessage: 'Copy',
  },
  copied: {
    id: 'messageActions.copied',
    defaultMessage: 'Copied!',
  },
  goodResponse: {
    id: 'messageActions.goodResponse',
    defaultMessage: 'Good response',
  },
  badResponse: {
    id: 'messageActions.badResponse',
    defaultMessage: 'Bad response',
  },
});

const actionButtonClass =
  'flex size-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-background-tertiary/60 hover:text-text-primary';

interface MessageActionsProps {
  text: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

/** ChatGPT-style action icon row under an assistant message: copy + feedback. */
export default function MessageActions({ text, contentRef, className }: MessageActionsProps) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    try {
      if (contentRef?.current) {
        const container = document.createElement('div');
        container.innerHTML = contentRef.current.innerHTML;
        container.querySelectorAll('button').forEach((button) => button.remove());
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([container.innerHTML], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
      } catch (fallbackError) {
        console.error('Failed to copy text: ', fallbackError);
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        onClick={handleCopy}
        className={actionButtonClass}
        title={intl.formatMessage(copied ? i18n.copied : i18n.copy)}
        aria-label={intl.formatMessage(i18n.copy)}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
      <button
        onClick={() => setFeedback((current) => (current === 'up' ? null : 'up'))}
        className={cn(actionButtonClass, feedback === 'up' && 'text-text-primary')}
        title={intl.formatMessage(i18n.goodResponse)}
        aria-label={intl.formatMessage(i18n.goodResponse)}
      >
        <ThumbsUp className="size-4" fill={feedback === 'up' ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={() => setFeedback((current) => (current === 'down' ? null : 'down'))}
        className={cn(actionButtonClass, feedback === 'down' && 'text-text-primary')}
        title={intl.formatMessage(i18n.badResponse)}
        aria-label={intl.formatMessage(i18n.badResponse)}
      >
        <ThumbsDown className="size-4" fill={feedback === 'down' ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

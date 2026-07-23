/* global ClipboardItem */

import React, { useState } from 'react';
import { Copy } from './icons';
import { defineMessages, useIntl } from '../i18n';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/Tooltip';

const i18n = defineMessages({
  copied: {
    id: 'messageCopyLink.copied',
    defaultMessage: 'Copied!',
  },
  copy: {
    id: 'messageCopyLink.copy',
    defaultMessage: 'Copy',
  },
});

interface MessageCopyLinkProps {
  text: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export default function MessageCopyLink({ text, contentRef }: MessageCopyLinkProps) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (contentRef?.current) {
        // Create a temporary container to handle HTML content
        const container = document.createElement('div');
        container.innerHTML = contentRef.current.innerHTML;

        // Clean up any copy buttons from the content
        const copyButtons = container.querySelectorAll('button');
        copyButtons.forEach((button) => button.remove());

        // Create the clipboard data
        const clipboardData = new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([container.innerHTML], { type: 'text/html' }),
        });

        await navigator.clipboard.write([clipboardData]);
      } else {
        await navigator.clipboard.writeText(text);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback to plain text if HTML copy fails
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Failed to copy text (fallback): ', fallbackErr);
      }
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="flex size-8 items-center justify-center rounded-[10px] text-text-secondary opacity-0 transition-colors hover:bg-background-tertiary hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary group-hover:opacity-100"
          aria-label={copied ? intl.formatMessage(i18n.copied) : intl.formatMessage(i18n.copy)}
        >
          <Copy className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={2}
        hideArrow
        className="rounded-[10px] bg-background-tertiary px-2.5 py-1 text-sm leading-5 text-text-primary shadow-lg"
      >
        {copied ? intl.formatMessage(i18n.copied) : intl.formatMessage(i18n.copy)}
      </TooltipContent>
    </Tooltip>
  );
}

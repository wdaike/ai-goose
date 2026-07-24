import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Check, Copy } from './icons';
import CodeViewer from './CodeViewer';
import { wrapHTMLInCodeBlock } from '../utils/htmlSecurity';
import { isProtocolSafe, getProtocol, BLOCKED_PROTOCOLS } from '../utils/urlSecurity';
import { ConfirmationModal } from './ui/ConfirmationModal';
import { defineMessages, useIntl } from '../i18n';

const i18n = defineMessages({
  copyCode: {
    id: 'markdownContent.copyCode',
    defaultMessage: 'Copy code',
  },
  openExternalLink: {
    id: 'markdownContent.openExternalLink',
    defaultMessage: 'Open External Link',
  },
  openProtocolLink: {
    id: 'markdownContent.openProtocolLink',
    defaultMessage: 'Open {protocol} link?',
  },
  thisWillOpen: {
    id: 'markdownContent.thisWillOpen',
    defaultMessage: 'This will open: {href}',
  },
  open: {
    id: 'markdownContent.open',
    defaultMessage: 'Open',
  },
  cancel: {
    id: 'markdownContent.cancel',
    defaultMessage: 'Cancel',
  },
  failedToOpenLink: {
    id: 'markdownContent.failedToOpenLink',
    defaultMessage: 'Failed to Open Link',
  },
  noApplicationFound: {
    id: 'markdownContent.noApplicationFound',
    defaultMessage: 'No application found to open this link.',
  },
});

type CodeProps = React.ClassAttributes<HTMLElement> & React.HTMLAttributes<HTMLElement>;

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Memoized CodeBlock component to prevent re-rendering when props haven't changed
const CodeBlock = memo(function CodeBlock({
  language,
  children,
}: {
  language: string;
  children: string;
}) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const memoizedCodeViewer = useMemo(
    () => (
      <CodeViewer
        code={children}
        language={language}
        wrapLongLines
        surface="secondary"
      />
    ),
    [language, children]
  );

  return (
    <div className="relative group w-full">
      <button
        onClick={handleCopy}
        className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-background-tertiary/80 text-text-secondary font-sans text-sm
                 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                 hover:bg-background-tertiary hover:text-text-primary z-10"
        title={intl.formatMessage(i18n.copyCode)}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <div className="w-full overflow-hidden rounded-lg">{memoizedCodeViewer}</div>
    </div>
  );
});

const MarkdownCode = memo(
  React.forwardRef(function MarkdownCode(
    { className, children, ...props }: CodeProps,
    ref: React.Ref<HTMLElement>
  ) {
    const match = /language-(\w+)/.exec(className || '');
    const text = String(children);
    // react-markdown v9+ dropped the `inline` prop: fenced blocks are detected
    // by their language class or by the newline fenced content always carries.
    const isBlock = Boolean(match) || text.includes('\n');
    return isBlock ? (
      <CodeBlock language={match?.[1] ?? 'text'}>{text.replace(/\n$/, '')}</CodeBlock>
    ) : (
      <code ref={ref} {...props} className="break-all bg-inline-code whitespace-pre-wrap font-mono">
        {children}
      </code>
    );
  })
);

// Custom URL transform to preserve deep link URLs (spotify:, vscode:, slack:, etc.)
// React-markdown's default only allows http/https/mailto and strips all other protocols
// We allow all protocols except dangerous ones (javascript:, data:, file:, etc.)
const customUrlTransform = (url: string): string => {
  try {
    const protocol = new URL(url).protocol;
    if (BLOCKED_PROTOCOLS.includes(protocol)) {
      return '';
    }
  } catch {
    // Not a valid URL, allow it (could be relative path)
  }
  return url;
};

const MarkdownContent = memo(function MarkdownContent({
  content,
  className = '',
}: MarkdownContentProps) {
  const intl = useIntl();
  const [processedContent, setProcessedContent] = useState(content);
  const [pendingLink, setPendingLink] = useState<{ protocol: string; href: string } | null>(null);

  useEffect(() => {
    try {
      const processed = wrapHTMLInCodeBlock(content);
      setProcessedContent(processed);
    } catch (error) {
      console.error('Error processing content:', error);
      setProcessedContent(content);
    }
  }, [content]);

  const handleConfirmOpen = useCallback(async () => {
    if (pendingLink) {
      try {
        await window.electron.openExternal(pendingLink.href);
      } catch {
        await window.electron.showMessageBox({
          type: 'error',
          buttons: ['OK'],
          title: intl.formatMessage(i18n.failedToOpenLink),
          message: intl.formatMessage(i18n.noApplicationFound),
          detail: pendingLink.href,
        });
      }
    }
    setPendingLink(null);
  }, [pendingLink, intl]);

  const handleCancelOpen = useCallback(() => {
    setPendingLink(null);
  }, []);

  return (
    <>
      <div
        className={`w-full overflow-x-hidden prose prose-base text-text-primary dark:prose-invert max-w-full word-break font-sans
        prose-p:leading-7 prose-li:leading-7
        prose-pre:m-0 prose-pre:rounded-none prose-pre:bg-transparent prose-pre:p-0 !p-0
        prose-code:break-all prose-code:whitespace-pre-wrap prose-code:font-mono
        prose-a:break-all prose-a:overflow-wrap-anywhere
        prose-table:table prose-table:w-full
        prose-blockquote:text-inherit
        prose-td:border prose-td:border-border-primary prose-td:p-2
        prose-th:border prose-th:border-border-primary prose-th:p-2
        prose-thead:bg-background-primary
        prose-h1:text-2xl prose-h1:font-semibold prose-h1:mb-5 prose-h1:mt-0 prose-h1:font-sans
        prose-h2:text-xl prose-h2:font-semibold prose-h2:mb-4 prose-h2:mt-4 prose-h2:font-sans
        prose-h3:text-lg prose-h3:font-semibold prose-h3:mb-3 prose-h3:mt-3 prose-h3:font-sans
        prose-p:mt-0 prose-p:mb-2 prose-p:font-sans
        prose-ol:my-2 prose-ol:font-sans
        prose-ul:mt-0 prose-ul:mb-3 prose-ul:font-sans
        prose-li:m-0 prose-li:font-sans ${className}`}
      >
        <ReactMarkdown
          urlTransform={customUrlTransform}
          remarkPlugins={[remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]}
          rehypePlugins={[
            [
              rehypeKatex,
              {
                throwOnError: false,
                errorColor: '#cc0000',
                strict: false,
              },
            ],
          ]}
          components={{
            a: (props) => {
              return (
                <a
                  {...props}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!props.href) return;

                    if (isProtocolSafe(props.href)) {
                      window.electron.openExternal(props.href);
                    } else {
                      const protocol = getProtocol(props.href);
                      if (!protocol) return;
                      setPendingLink({ protocol, href: props.href });
                    }
                  }}
                />
              );
            },
            code: MarkdownCode,
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
      <ConfirmationModal
        isOpen={pendingLink !== null}
        title={intl.formatMessage(i18n.openExternalLink)}
        message={intl.formatMessage(i18n.openProtocolLink, {
          protocol: pendingLink?.protocol ?? '',
        })}
        detail={intl.formatMessage(i18n.thisWillOpen, { href: pendingLink?.href ?? '' })}
        onConfirm={handleConfirmOpen}
        onCancel={handleCancelOpen}
        confirmLabel={intl.formatMessage(i18n.open)}
        cancelLabel={intl.formatMessage(i18n.cancel)}
      />
    </>
  );
});

export default MarkdownContent;

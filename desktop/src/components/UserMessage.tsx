import { useCallback, useEffect, useRef, useState } from 'react';
import ImagePreview from './ImagePreview';
import MarkdownContent from './MarkdownContent';
import { getTextAndImageContent, type Message } from '../types/message';
import MessageCopyLink from './MessageCopyLink';
import { formatMessageTimestamp } from '../utils/timeUtils';
import { defineMessages, useIntl } from '../i18n';
import { Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/Tooltip';

const i18n = defineMessages({
  editPlaceholder: {
    id: 'userMessage.editPlaceholder',
    defaultMessage: 'Edit your message...',
  },
  editAriaLabel: {
    id: 'userMessage.editAriaLabel',
    defaultMessage: 'Edit message content',
  },
  emptyError: {
    id: 'userMessage.emptyError',
    defaultMessage: 'Message cannot be empty',
  },
  editInPlaceDescription: {
    id: 'userMessage.editInPlaceDescription',
    defaultMessage:
      '<b>Edit in Place</b> updates this session • <b>Fork Session</b> creates a new session',
  },
  cancel: {
    id: 'userMessage.cancel',
    defaultMessage: 'Cancel',
  },
  cancelAriaLabel: {
    id: 'userMessage.cancelAriaLabel',
    defaultMessage: 'Cancel editing',
  },
  send: {
    id: 'chatInput.send',
    defaultMessage: 'Send',
  },
  editInPlace: {
    id: 'userMessage.editInPlace',
    defaultMessage: 'Edit in Place',
  },
  editInPlaceAriaLabel: {
    id: 'userMessage.editInPlaceAriaLabel',
    defaultMessage: 'Edit message in place',
  },
  editInPlaceTitle: {
    id: 'userMessage.editInPlaceTitle',
    defaultMessage: 'Update the message in this session',
  },
  forkSession: {
    id: 'userMessage.forkSession',
    defaultMessage: 'Fork Session',
  },
  forkSessionAriaLabel: {
    id: 'userMessage.forkSessionAriaLabel',
    defaultMessage: 'Fork session with edited message',
  },
  forkSessionTitle: {
    id: 'userMessage.forkSessionTitle',
    defaultMessage: 'Create a new session with the edited message',
  },
  editButton: {
    id: 'userMessage.editButton',
    defaultMessage: 'Edit',
  },
  editMessageAriaLabel: {
    id: 'userMessage.editMessageAriaLabel',
    defaultMessage: 'Edit message: {preview}',
  },
  editMessageTitle: {
    id: 'userMessage.editMessageTitle',
    defaultMessage: 'Edit message',
  },
});

interface UserMessageProps {
  message: Message;
  onMessageUpdate?: (messageId: string, newContent: string, editType?: 'fork' | 'edit') => void;
}

export default function UserMessage({ message, onMessageUpdate }: UserMessageProps) {
  const intl = useIntl();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { textContent, imagePaths } = getTextAndImageContent(message);
  const timestamp = formatMessageTimestamp(message.created);

  // Effect to handle message content changes and ensure persistence
  useEffect(() => {
    // If we're not editing, update the edit content to match the current message
    if (!isEditing) {
      setEditContent(textContent);
    }
  }, [message.content, textContent, message.id, isEditing]);

  // Initialize edit mode with current message content
  const initializeEditMode = useCallback(() => {
    setEditContent(textContent);
    setError(null);
    window.electron.logInfo(`Entering edit mode with content: ${textContent}`);
  }, [textContent]);

  // Handle edit button click
  const handleEditClick = useCallback(() => {
    const newEditingState = !isEditing;
    setIsEditing(newEditingState);

    // Initialize edit content when entering edit mode
    if (newEditingState) {
      initializeEditMode();
      window.electron.logInfo(`Edit interface shown for message: ${message.id}`);

      // Focus the textarea after a brief delay to ensure it's rendered
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            textareaRef.current.value.length,
            textareaRef.current.value.length
          );
        }
      }, 50);
    }

    window.electron.logInfo(`Edit state toggled: ${newEditingState} for message: ${message.id}`);
  }, [isEditing, initializeEditMode, message.id]);

  // Handle content changes in edit mode
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEditContent(newContent);
    setError(null); // Clear any previous errors
    window.electron.logInfo(`Content changed: ${newContent}`);
  }, []);

  const handleSave = useCallback(() => {
    if (editContent.trim().length === 0) {
      setError(intl.formatMessage(i18n.emptyError));
      return;
    }

    setIsEditing(false);

    if (onMessageUpdate && message.id) {
      onMessageUpdate(message.id, editContent, 'fork');
    }
  }, [editContent, onMessageUpdate, message.id, intl]);

  // Handle cancel action
  const handleCancel = useCallback(() => {
    window.electron.logInfo('Cancel clicked - reverting to original content');
    setIsEditing(false);
    setEditContent(textContent); // Reset to original content
    setError(null);
  }, [textContent]);

  // Handle keyboard events for accessibility
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      window.electron.logInfo(
        `Key pressed: ${e.key}, metaKey: ${e.metaKey}, ctrlKey: ${e.ctrlKey}`
      );

      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        window.electron.logInfo('Cmd+Enter detected, calling handleSave');
        handleSave();
      }
    },
    [handleCancel, handleSave]
  );

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [editContent, isEditing]);

  return (
    <div className="w-full opacity-0 animate-[appear_150ms_ease-in_forwards]">
      <div className="flex flex-col group">
        {isEditing ? (
          <div
            className="flex min-h-[120px] w-full flex-col rounded-[26px] bg-background-secondary px-4 pb-4 pt-4 text-text-primary"
            data-testid="user-message-editor"
          >
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              className="block w-full resize-none overflow-y-auto border-none bg-transparent p-0 text-base leading-6 text-text-primary outline-none placeholder:text-text-secondary focus:outline-none focus:ring-0"
              style={{
                minHeight: '24px',
                maxHeight: '240px',
                fontFamily: 'inherit',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
              placeholder={intl.formatMessage(i18n.editPlaceholder)}
              aria-label={intl.formatMessage(i18n.editAriaLabel)}
              aria-describedby={error ? `error-${message.id}` : undefined}
            />
            {error && (
              <div
                id={`error-${message.id}`}
                className="mt-2 text-xs text-text-danger"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}
            <div className="mt-auto flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="h-[34px] rounded-full border border-border-secondary bg-transparent px-3.5 text-base font-medium text-text-primary transition-colors hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                aria-label={intl.formatMessage(i18n.cancelAriaLabel)}
              >
                {intl.formatMessage(i18n.cancel)}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="h-[34px] rounded-full bg-background-inverse px-3.5 text-base font-medium text-text-inverse transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-inverse disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={intl.formatMessage(i18n.send)}
                disabled={editContent.trim().length === 0}
              >
                {intl.formatMessage(i18n.send)}
              </button>
            </div>
          </div>
        ) : (
          <div className="message flex justify-end w-full">
            <div className="flex-col max-w-[85%] w-fit">
              <div className="flex flex-col group">
                {textContent.trim() && (
                  <div
                    className="flex rounded-3xl bg-background-secondary px-4 py-2.5 text-text-primary"
                    data-testid="user-message-bubble"
                  >
                    <div ref={contentRef}>
                      <MarkdownContent
                        content={textContent}
                        className="!text-inherit prose-a:!text-inherit prose-headings:!text-inherit prose-strong:!text-inherit prose-em:!text-inherit prose-li:!text-inherit prose-p:!text-inherit user-message"
                      />
                    </div>
                  </div>
                )}

                {imagePaths.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {imagePaths.map((imagePath, index) => (
                      <ImagePreview key={index} src={imagePath} />
                    ))}
                  </div>
                )}

                <div className="mt-1 flex h-8 items-center justify-end gap-2 text-right">
                  <time className="text-sm tabular-nums text-text-secondary">{timestamp}</time>
                  <MessageCopyLink text={textContent} contentRef={contentRef} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleEditClick}
                        className="flex size-8 items-center justify-center rounded-[10px] text-text-secondary opacity-0 transition-colors hover:bg-background-tertiary hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary group-hover:opacity-100"
                        aria-label={intl.formatMessage(i18n.editMessageAriaLabel, {
                          preview: `${textContent.substring(0, 50)}${textContent.length > 50 ? '...' : ''}`,
                        })}
                        aria-expanded={isEditing}
                      >
                        <Pencil className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={2}
                      hideArrow
                      className="rounded-[10px] bg-background-tertiary px-2.5 py-1 text-sm leading-5 text-text-primary shadow-lg"
                    >
                      {intl.formatMessage(i18n.editButton)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

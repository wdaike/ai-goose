import React, { useState } from 'react';
import { CornerDownRight, Edit2, ListTree, MoreHorizontal, Trash2, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { QueuedMessage } from '../../codex/engine/messageQueue';

export type { QueuedMessage };
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  paused: {
    id: 'messageQueue.paused',
    defaultMessage: 'Paused',
  },
  steer: {
    id: 'messageQueue.steer',
    defaultMessage: 'Steer',
  },
  steerHint: {
    id: 'messageQueue.steerHint',
    defaultMessage: 'Steer the running turn with this message',
  },
  editInstruction: {
    id: 'messageQueue.editInstruction',
    defaultMessage: 'Edit instruction',
  },
  moreOptions: {
    id: 'messageQueue.moreOptions',
    defaultMessage: 'More options',
  },
  queuePausedCompact: {
    id: 'messageQueue.queuePausedCompact',
    defaultMessage: 'Queue paused - click "Steer" or add new message to resume',
  },
  clearAll: {
    id: 'messageQueue.clearAll',
    defaultMessage: 'Clear All',
  },
  save: {
    id: 'messageQueue.save',
    defaultMessage: 'Save',
  },
  cancel: {
    id: 'messageQueue.cancel',
    defaultMessage: 'Cancel',
  },
  removeFromQueue: {
    id: 'messageQueue.removeFromQueue',
    defaultMessage: 'Remove this message from queue',
  },
});

interface MessageQueueProps {
  queuedMessages: QueuedMessage[];
  onRemoveMessage: (id: string) => void;
  onClearQueue: () => void;
  onStopAndSend?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onTriggerQueueProcessing?: () => void;
  editingMessageIdRef?: React.MutableRefObject<string | null>;
  onReorderMessages?: (reorderedMessages: QueuedMessage[]) => void;
  sendingMessageIds?: ReadonlySet<string>;
  className?: string;
  isPaused?: boolean;
}

export const MessageQueue: React.FC<MessageQueueProps> = ({
  queuedMessages,
  onRemoveMessage,
  onClearQueue,
  onStopAndSend,
  onEditMessage,
  onTriggerQueueProcessing,
  editingMessageIdRef,
  onReorderMessages,
  sendingMessageIds,
  className = '',
  isPaused = false,
}) => {
  const intl = useIntl();
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const isSendingMessage = (messageId: string) => sendingMessageIds?.has(messageId) ?? false;

  if (queuedMessages.length === 0) {
    return null;
  }

  const handleDragStart = (e: React.DragEvent, messageId: string) => {
    if (isSendingMessage(messageId)) {
      e.preventDefault();
      return;
    }

    setDraggedItem(messageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', messageId);
  };

  const handleDragOver = (e: React.DragEvent, messageId: string) => {
    if (isSendingMessage(messageId)) {
      return;
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItem(messageId);
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetMessageId: string) => {
    e.preventDefault();

    if (!draggedItem || !onReorderMessages || isSendingMessage(targetMessageId)) return;

    const draggedIndex = queuedMessages.findIndex((msg) => msg.id === draggedItem);
    const targetIndex = queuedMessages.findIndex((msg) => msg.id === targetMessageId);

    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const newMessages = [...queuedMessages];
    const [removed] = newMessages.splice(draggedIndex, 1);
    newMessages.splice(targetIndex, 0, removed);

    onReorderMessages(newMessages);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const startEditing = (message: QueuedMessage) => {
    setEditingMessage(message.id);
    if (editingMessageIdRef) editingMessageIdRef.current = message.id;
    setEditContent(message.content);
  };

  const finishEditing = (save: boolean, messageId: string) => {
    if (save && onEditMessage) {
      onEditMessage(messageId, editContent);
    }
    setEditingMessage(null);
    if (editingMessageIdRef) editingMessageIdRef.current = null;
    if (onTriggerQueueProcessing) {
      setTimeout(onTriggerQueueProcessing, 100);
    }
    setEditContent('');
  };

  const hasSendingMessages = queuedMessages.some((message) => isSendingMessage(message.id));

  return (
    <div className={`relative ${className}`}>
      {isPaused && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 truncate">{intl.formatMessage(i18n.queuePausedCompact)}</span>
        </div>
      )}

      <div className="p-2 space-y-2">
        {queuedMessages.map((message) => {
          const isSending = isSendingMessage(message.id);
          const isEditing = editingMessage === message.id;

          if (isEditing) {
            return (
              <div
                key={message.id}
                className="rounded-xl border border-border-secondary bg-background-secondary px-3 py-2.5 space-y-2"
              >
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  disabled={isSending}
                  className="w-full text-sm bg-background-primary border border-border-primary rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-border-secondary"
                  rows={Math.min(Math.max(Math.ceil(editContent.length / 60), 1), 6)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSending}
                    onClick={() => finishEditing(true, message.id)}
                    className="h-7 px-3 text-xs"
                  >
                    {intl.formatMessage(i18n.save)}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => finishEditing(false, message.id)}
                    className="h-7 px-3 text-xs"
                  >
                    {intl.formatMessage(i18n.cancel)}
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={message.id}
              draggable={Boolean(onReorderMessages && !isSending)}
              onDragStart={(e) => handleDragStart(e, message.id)}
              onDragOver={(e) => handleDragOver(e, message.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, message.id)}
              onDragEnd={handleDragEnd}
              className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
                draggedItem === message.id
                  ? 'opacity-60 border-border-secondary'
                  : dragOverItem === message.id
                    ? 'border-border-secondary bg-background-secondary'
                    : 'border-border-primary bg-background-primary hover:border-border-secondary'
              } ${isSending ? 'opacity-60' : ''}`}
            >
              <ListTree className="w-4 h-4 flex-shrink-0 text-text-tertiary" />

              <p
                className="flex-1 min-w-0 truncate text-sm text-text-primary"
                title={message.content}
              >
                {message.content}
              </p>

              <div className="flex items-center gap-1 flex-shrink-0">
                {onStopAndSend && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSending}
                    onClick={() => onStopAndSend(message.id)}
                    title={intl.formatMessage(i18n.steerHint)}
                    className="h-7 gap-1 px-2 text-xs text-text-secondary hover:text-text-primary"
                  >
                    <CornerDownRight className="w-3.5 h-3.5" />
                    {intl.formatMessage(i18n.steer)}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSending}
                  onClick={() => onRemoveMessage(message.id)}
                  title={intl.formatMessage(i18n.removeFromQueue)}
                  className="h-7 w-7 p-0 text-text-tertiary hover:text-text-danger"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={isSending}
                      aria-label={intl.formatMessage(i18n.moreOptions)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-secondary disabled:opacity-50"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={isSending}
                      onSelect={() => startEditing(message)}
                    >
                      <Edit2 className="size-4" />
                      {intl.formatMessage(i18n.editInstruction)}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      {queuedMessages.length > 1 && (
        <div className="flex justify-end px-2 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearQueue}
            disabled={hasSendingMessages}
            className="h-6 px-2 text-xs text-text-tertiary hover:text-text-danger"
          >
            {intl.formatMessage(i18n.clearAll)}
          </Button>
        </div>
      )}
    </div>
  );
};

export default MessageQueue;

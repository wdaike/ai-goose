import type { GooseExtension } from '../types/goose';
import type { Session } from '../types/session';
import type { Message } from '../types/message';
import type { AcpChatSessionSnapshot } from './chatSessionStore';

export interface AcpLoadSessionOptions {
  onSessionLoaded?: () => void;
}

export interface AcpSnapshotOptions {
  getCurrentSnapshot(): AcpChatSessionSnapshot | undefined;
}

export interface AcpSubmitMessageOptions extends AcpSnapshotOptions {
  onFinish(error?: string): void | Promise<void>;
}

export interface AcpChatSessionController {
  createSession(cwd: string, gooseExtensions: GooseExtension[]): Promise<Session>;
  loadSession(sessionId: string, options?: AcpLoadSessionOptions): Promise<void>;
  restoreSession(sessionId: string): Promise<void>;
  submitMessage(
    sessionId: string,
    userMessage: Message,
    options: AcpSubmitMessageOptions
  ): Promise<void>;
  stop(sessionId: string): void;
  updateMessage(
    sessionId: string,
    messageId: string,
    newContent: string,
    editType: 'fork' | 'edit' | undefined,
    options: AcpSubmitMessageOptions
  ): Promise<void>;
}

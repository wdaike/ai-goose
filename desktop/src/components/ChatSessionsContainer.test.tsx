import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatSessionsContainer from './ChatSessionsContainer';
import { subscribeToAcpRecovery } from '../acp/acpConnection';
import { codexChatSessionController } from '../codex/engine/controller';

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams('resumeSessionId=session-1')],
}));

vi.mock('./BaseChat', () => ({
  default: ({ sessionId }: { sessionId: string }) => <div>{sessionId}</div>,
}));

vi.mock('../acp/acpConnection', () => ({
  subscribeToAcpRecovery: vi.fn(),
}));

vi.mock('../codex/engine/controller', () => ({
  codexChatSessionController: {
    restoreSession: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('ChatSessionsContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores active chat sessions after ACP reconnects', () => {
    let onRecoveryChanged: ((recovering: boolean) => void) | undefined;
    vi.mocked(subscribeToAcpRecovery).mockImplementation((listener) => {
      onRecoveryChanged = listener;
      return () => undefined;
    });

    render(
      <ChatSessionsContainer
        setChat={vi.fn()}
        activeSessions={[{ sessionId: 'session-1' }, { sessionId: 'session-2' }]}
      />
    );

    onRecoveryChanged?.(false);

    expect(codexChatSessionController.restoreSession).toHaveBeenCalledTimes(2);
    expect(codexChatSessionController.restoreSession).toHaveBeenCalledWith('session-1');
    expect(codexChatSessionController.restoreSession).toHaveBeenCalledWith('session-2');
  });
});

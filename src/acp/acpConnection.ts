import type {
  CancelNotification,
  CloseSessionRequest,
  CloseSessionResponse,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  SessionInfo,
} from '@agentclientprotocol/sdk';

// The legacy goose serve backend is gone; all data flows through the codex
// bridge (`window.codex`). These stubs keep the recovery-aware UI surfaces
// compiling with a permanently-healthy connection state.

type AcpRecoveryListener = (recovering: boolean) => void;

interface RemovedAcpClient {
  prompt(params: PromptRequest): Promise<PromptResponse>;
  cancel(params: CancelNotification): Promise<void>;
  loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse>;
  newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
  unstable_closeSession(params: CloseSessionRequest): Promise<CloseSessionResponse>;
  goose: {
    sessionInfo_unstable(params: { sessionId: string }): Promise<{ session: SessionInfo }>;
    sessionWorkingDirUpdate_unstable(params: {
      sessionId: string;
      workingDir: string;
    }): Promise<unknown>;
    sessionConversationTruncate_unstable(params: {
      sessionId: string;
      truncateFrom: number;
    }): Promise<unknown>;
  };
}

export async function getAcpClient(): Promise<RemovedAcpClient> {
  throw new Error('The ACP backend has been removed; use the codex bridge');
}

export async function getAcpInitializeResponse(): Promise<InitializeResponse> {
  throw new Error('The ACP backend has been removed; use the codex bridge');
}

export function reconnectAcpAfterSystemResume(): void {}

export function isAcpRecovering(): boolean {
  return false;
}

export function subscribeToAcpRecovery(_listener: AcpRecoveryListener): () => void {
  return () => {};
}

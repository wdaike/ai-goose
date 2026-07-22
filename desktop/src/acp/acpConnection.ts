import { GooseClient } from '@aaif/goose-sdk';
import type { InitializeResponse } from '@agentclientprotocol/sdk';

// The legacy goose serve backend is gone; all data flows through the codex
// bridge (`window.codex`). These stubs keep the recovery-aware UI surfaces
// compiling with a permanently-healthy connection state.

type AcpRecoveryListener = (recovering: boolean) => void;

export async function getAcpClient(): Promise<GooseClient> {
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

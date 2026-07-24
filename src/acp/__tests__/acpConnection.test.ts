import { describe, expect, it, vi } from 'vitest';
import {
  getAcpClient,
  getAcpInitializeResponse,
  isAcpRecovering,
  reconnectAcpAfterSystemResume,
  subscribeToAcpRecovery,
} from '../acpConnection';

// The legacy goose serve backend is gone; acpConnection is a permanent stub
// that keeps recovery-aware UI surfaces working against a healthy connection.
describe('ACP connection stubs (codex bridge)', () => {
  it('rejects client access now that the ACP backend is gone', async () => {
    await expect(getAcpClient()).rejects.toThrow('codex bridge');
    await expect(getAcpInitializeResponse()).rejects.toThrow('codex bridge');
  });

  it('reports a permanently healthy connection', () => {
    expect(isAcpRecovering()).toBe(false);
    expect(() => reconnectAcpAfterSystemResume()).not.toThrow();
  });

  it('never notifies recovery subscribers and returns a working unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAcpRecovery(listener);

    reconnectAcpAfterSystemResume();

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});

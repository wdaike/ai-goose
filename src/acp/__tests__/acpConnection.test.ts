import { describe, expect, it } from 'vitest';
import { getAcpClient, getAcpInitializeResponse } from '../acpConnection';

// The legacy goose serve backend is gone; acpConnection only keeps the
// not-yet-migrated ACP client call sites compiling by throwing.
describe('ACP connection stubs (codex bridge)', () => {
  it('rejects client access now that the ACP backend is gone', async () => {
    await expect(getAcpClient()).rejects.toThrow('codex bridge');
    await expect(getAcpInitializeResponse()).rejects.toThrow('codex bridge');
  });
});

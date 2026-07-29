import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codex } from '../../codex/client';
import type { Thread } from '../../codex/protocol/v2/Thread';
import {
  acpArchiveSession,
  acpGetSessionListItem,
  acpListPinnedSessions,
  acpListRecentSessions,
  acpSetSessionPinned,
} from '../sessions';

vi.mock('../../codex/client', () => ({
  codex: {
    threadRead: vi.fn(),
    threadList: vi.fn(),
    threadArchive: vi.fn(),
    threadMetadataUpdate: vi.fn(),
  },
}));

describe('ACP sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    });
  });

  it('returns a list item from a codex thread', async () => {
    const thread = {
      id: 'session-1',
      name: 'Subagent session',
      preview: 'first user message',
      cwd: '/tmp',
      createdAt: 1767225600, // 2026-01-01T00:00:00Z
      updatedAt: 1767225660, // 2026-01-01T00:01:00Z
    } as unknown as Thread;
    vi.mocked(codex.threadRead).mockResolvedValue({ thread });

    const item = await acpGetSessionListItem('session-1');

    expect(codex.threadRead).toHaveBeenCalledWith({ threadId: 'session-1' });
    expect(item).toMatchObject({
      id: 'session-1',
      name: 'Subagent session',
      workingDir: '/tmp',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
      userSetName: true,
    });
  });

  it('archives a session via its codex thread', async () => {
    vi.mocked(codex.threadArchive).mockResolvedValue({});

    await acpArchiveSession('session-1');

    expect(codex.threadArchive).toHaveBeenCalledWith('session-1');
  });

  it('hides a thread whose rollout is missing and drops it from lists', async () => {
    vi.mocked(codex.threadArchive).mockRejectedValue(
      new Error('thread/archive: {"code":-32600,"message":"no rollout found for thread id ghost"}')
    );
    const thread = (id: string) =>
      ({
        id,
        name: null,
        preview: 'hello',
        cwd: '/tmp',
        createdAt: 1767225600,
        updatedAt: 1767225660,
      }) as unknown as Thread;
    vi.mocked(codex.threadList).mockResolvedValue({
      data: [thread('ghost'), thread('kept')],
      nextCursor: null,
    });

    await expect(acpArchiveSession('ghost')).resolves.toBeUndefined();

    const sessions = await acpListRecentSessions(25);
    expect(sessions.map((s) => s.id)).toEqual(['kept']);
  });

  it('pins a session through thread metadata', async () => {
    vi.mocked(codex.threadMetadataUpdate).mockResolvedValue({});

    await acpSetSessionPinned('session-1', true);

    expect(codex.threadMetadataUpdate).toHaveBeenCalledWith({
      threadId: 'session-1',
      isPinned: true,
    });
  });

  it('lists pinned sessions and carries the pinned flag', async () => {
    vi.mocked(codex.threadList).mockResolvedValue({
      data: [
        {
          id: 'pinned-1',
          name: 'Pinned chat',
          preview: 'hello',
          cwd: '/tmp',
          createdAt: 1767225600,
          updatedAt: 1767225660,
          isPinned: true,
        } as unknown as Thread,
      ],
      nextCursor: null,
    });

    const sessions = await acpListPinnedSessions(25);

    expect(codex.threadList).toHaveBeenCalledWith({
      limit: 25,
      sortKey: 'updated_at',
      isPinned: true,
    });
    expect(sessions).toMatchObject([{ id: 'pinned-1', isPinned: true }]);
  });

  it('rethrows archive failures unrelated to missing rollouts', async () => {
    vi.mocked(codex.threadArchive).mockRejectedValue(new Error('connection lost'));

    await expect(acpArchiveSession('session-1')).rejects.toThrow('connection lost');
  });
});

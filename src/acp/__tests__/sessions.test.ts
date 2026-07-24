import type { SessionInfo } from '@agentclientprotocol/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAcpClient } from '../acpConnection';
import { codex } from '../../codex/client';
import type { Thread } from '../../codex/protocol/v2/Thread';
import {
  acpArchiveSession,
  acpGetSessionListItem,
  acpListRecentSessions,
  acpLoadSession,
  sessionInfoToSession,
} from '../sessions';

vi.mock('../acpConnection', () => ({
  getAcpClient: vi.fn(),
}));

vi.mock('../../codex/client', () => ({
  codex: {
    threadRead: vi.fn(),
    threadList: vi.fn(),
    threadArchive: vi.fn(),
  },
}));

function sessionInfo(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    sessionId: 'session-1',
    cwd: '/tmp',
    title: 'Scheduled session',
    updatedAt: '2026-01-01T00:00:00Z',
    _meta: {
      createdAt: '2026-01-01T00:00:00Z',
      messageCount: 0,
      sessionType: 'scheduled',
    },
    ...overrides,
  } as unknown as SessionInfo;
}

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

  it('preserves session type from ACP session info metadata', () => {
    const session = sessionInfoToSession(sessionInfo());

    expect(session.session_type).toBe('scheduled');
  });

  it('returns session info refreshed after loading the ACP session', async () => {
    const loadedSessionInfo = sessionInfo({
      _meta: {
        createdAt: '2026-01-01T00:00:00Z',
        messageCount: 0,
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
    });
    const client = {
      goose: {
        sessionInfo_unstable: vi
          .fn()
          .mockResolvedValueOnce({ session: sessionInfo() })
          .mockResolvedValueOnce({ session: loadedSessionInfo }),
      },
      loadSession: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(getAcpClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof getAcpClient>>
    );

    const result = await acpLoadSession('session-1');

    expect(client.loadSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cwd: '/tmp',
      mcpServers: [],
    });
    expect(client.goose.sessionInfo_unstable).toHaveBeenCalledTimes(2);
    expect(result.sessionInfo).toBe(loadedSessionInfo);
    expect(sessionInfoToSession(result.sessionInfo).provider_name).toBe('anthropic');
    expect(sessionInfoToSession(result.sessionInfo).model_config?.model_name).toBe(
      'claude-sonnet-4-5'
    );
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

  it('rethrows archive failures unrelated to missing rollouts', async () => {
    vi.mocked(codex.threadArchive).mockRejectedValue(new Error('connection lost'));

    await expect(acpArchiveSession('session-1')).rejects.toThrow('connection lost');
  });
});

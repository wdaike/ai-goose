import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppEvents } from '../constants/events';
import type { Session } from '../types/session';
import { createSession } from '../sessions';
import Hub from './Hub';

vi.mock('../sessions', () => ({
  createSession: vi.fn(),
}));

vi.mock('../acp/sessions', () => ({
  acpListSessions: vi.fn().mockResolvedValue({ sessions: [], nextCursor: null }),
}));

vi.mock('./ConfigContext', () => ({
  useConfig: () => ({ extensionsList: [] }),
}));

vi.mock('../contexts/WorkspacePanelsContext', () => ({
  useWorkspacePanelsSafe: () => null,
}));

vi.mock('../utils/workingDir', () => ({
  getInitialWorkingDir: () => '/tmp/project',
}));

vi.mock('./ChatInput', () => ({
  default: ({ handleSubmit }: { handleSubmit: (input: { msg: string; images: [] }) => void }) => (
    <button onClick={() => handleSubmit({ msg: 'Hello', images: [] })}>Submit</button>
  ),
}));

vi.mock('./ChatInputCard', () => ({
  ChatInputCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./bottom_menu/DirSwitcher', () => ({
  DirSwitcher: () => null,
}));

vi.mock('./LoadingGoose', () => ({
  default: () => null,
}));

vi.mock('./icons/CodexCloud', () => ({
  CodexCloud: () => null,
}));

const session: Session = {
  id: 'session-1',
  name: 'New Chat',
  working_dir: '/tmp/project',
  created_at: '2026-07-24T03:18:25.000Z',
  updated_at: '2026-07-24T03:18:25.000Z',
  message_count: 0,
  extension_data: {},
};

describe('Hub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSession).mockResolvedValue(session);
    Object.assign(window.electron, {
      addRecentDir: vi.fn(),
      getGitBranch: vi.fn().mockResolvedValue(null),
      listRecentDirs: vi.fn().mockResolvedValue([]),
    });
  });

  it('includes the new session in the session-created event', async () => {
    const created = vi.fn();
    window.addEventListener(AppEvents.SESSION_CREATED, created);

    render(
      <IntlProvider locale="en">
        <Hub setView={vi.fn()} />
      </IntlProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(created).toHaveBeenCalledOnce());
    expect((created.mock.calls[0][0] as CustomEvent).detail).toEqual({ session });

    window.removeEventListener(AppEvents.SESSION_CREATED, created);
  });
});

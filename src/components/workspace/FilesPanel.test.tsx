import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { codex } from '../../codex/client';
import { IntlTestWrapper } from '../../i18n/test-utils';
import FilesPanel, { createFilePreview } from './FilesPanel';

vi.mock('../../codex/client', () => ({
  codex: {
    fsReadFile: vi.fn(),
  },
}));

vi.mock('../../contexts/WorkspacePanelsContext', () => ({
  useWorkspacePanels: () => ({
    isSidePanelOpen: true,
    toggleSidePanel: vi.fn(),
    workingDir: '/workspace',
  }),
}));

function encodeBase64(content: string): string {
  return window.btoa(content);
}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('FilesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electron.listDirectory = vi
      .fn()
      .mockResolvedValue([{ name: 'hello.ts', isDirectory: false }]);
  });

  it('opens a text file in the side-panel preview', async () => {
    const user = userEvent.setup();
    vi.mocked(codex.fsReadFile).mockResolvedValue({
      dataBase64: encodeBase64('export const greeting = "hello";'),
    });

    render(<FilesPanel />, { wrapper: IntlTestWrapper });

    await user.click(await screen.findByRole('button', { name: 'hello.ts' }));

    expect(codex.fsReadFile).toHaveBeenCalledWith({ path: '/workspace/hello.ts' });
    const codeViewer = await screen.findByTestId('code-viewer');
    expect(codeViewer).toHaveTextContent('export const greeting = "hello";');
    expect(codeViewer).toHaveAttribute('data-language', 'typescript');
    expect(screen.getByRole('button', { name: 'Back to files' })).toBeInTheDocument();
  });

  it('preserves expanded directories when returning from a preview', async () => {
    const user = userEvent.setup();
    vi.mocked(codex.fsReadFile).mockResolvedValue({ dataBase64: encodeBase64('hello') });
    vi.mocked(window.electron.listDirectory).mockImplementation(async (path) =>
      path === '/workspace'
        ? [{ name: 'src', isDirectory: true }]
        : [{ name: 'nested.ts', isDirectory: false }]
    );

    render(<FilesPanel />, { wrapper: IntlTestWrapper });
    await user.click(await screen.findByRole('button', { name: 'src' }));
    await user.click(await screen.findByRole('button', { name: 'nested.ts' }));
    await user.click(await screen.findByRole('button', { name: 'Back to files' }));

    expect(screen.getByRole('button', { name: 'nested.ts' })).toBeInTheDocument();
  });

  it('shows an error and lets the user retry the selected file', async () => {
    const user = userEvent.setup();
    vi.mocked(codex.fsReadFile)
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce({ dataBase64: encodeBase64('retry succeeded') });

    render(<FilesPanel />, { wrapper: IntlTestWrapper });
    await user.click(await screen.findByRole('button', { name: 'hello.ts' }));

    expect(await screen.findByText('Unable to preview this file')).toBeInTheDocument();
    expect(screen.getByText('Permission denied')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('retry succeeded')).toBeInTheDocument();
    expect(codex.fsReadFile).toHaveBeenCalledTimes(2);
  });
});

describe('createFilePreview', () => {
  it('rejects binary file contents', () => {
    expect(createFilePreview('/workspace/data.bin', encodeBase64('\0binary'))).toEqual({
      kind: 'binary',
    });
  });

  it('creates an image data URL for supported images', () => {
    expect(createFilePreview('/workspace/image.png', 'aGVsbG8=')).toEqual({
      kind: 'image',
      src: 'data:image/png;base64,aGVsbG8=',
    });
  });
});

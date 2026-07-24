import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../../../i18n/test-utils';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import AppearanceSection from './AppearanceSection';

vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, String(value)),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
});

const CODEX_EXPORT =
  'codex-theme-v1:{"codeThemeId":"codex","theme":{"accent":"#0169cc","contrast":40,"fonts":{"code":"\\"Geist Mono\\", ui-monospace","ui":"Geist, Inter"},"ink":"#0d0d0d","opaqueWindows":true,"surface":"#ffffff"},"variant":"light"}';

function renderSection() {
  return render(
    <IntlTestWrapper>
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>
    </IntlTestWrapper>
  );
}

describe('AppearanceSection import dialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('imports a codex-theme-v1 string pasted into the dialog', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Import' }));
    const input = screen.getByPlaceholderText('codex-theme-v1:{…}');
    const confirm = screen.getByRole('button', { name: 'Import theme' });
    expect(confirm).toBeDisabled();

    await user.click(input);
    await user.paste(CODEX_EXPORT);
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('appearance-settings')!);
      expect(saved.themes.light).toEqual({
        accent: '#0169cc',
        background: '#ffffff',
        foreground: '#0d0d0d',
      });
      expect(saved.uiFont).toMatch(/^Geist, Inter, /);
      expect(saved.contrast).toBe(40);
      expect(saved.translucentSidebar).toBe(false);
    });
    expect(screen.queryByPlaceholderText('codex-theme-v1:{…}')).not.toBeInTheDocument();
  });

  it('keeps the confirm button disabled for non codex-theme-v1 input', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByPlaceholderText('codex-theme-v1:{…}'));
    await user.paste('{"uiFont":"Inter"}');

    expect(screen.getByRole('button', { name: 'Import theme' })).toBeDisabled();
  });
});

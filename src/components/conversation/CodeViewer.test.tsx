import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CodeViewer, { languageFromFilePath } from './CodeViewer';

afterEach(() => {
  document.documentElement.classList.remove('dark', 'light');
});

describe('CodeViewer', () => {
  it('uses the standard light syntax theme on a light surface', () => {
    document.documentElement.classList.add('light');

    render(<CodeViewer code={'const value = "hello";'} language="typescript" />);

    const viewer = screen.getByTestId('code-viewer');
    expect(viewer).toHaveAttribute('data-theme', 'light');
    expect(viewer).toHaveAttribute('data-language', 'typescript');
    expect(viewer).toHaveTextContent('const value = "hello";');
    expect(viewer.firstElementChild).toHaveStyle({
      backgroundColor: 'var(--color-background-secondary)',
    });
  });

  it('reacts when the document switches to dark mode', async () => {
    document.documentElement.classList.add('light');
    render(<CodeViewer code="fn main() {}" language="rust" />);

    await act(async () => {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      await Promise.resolve();
    });

    expect(screen.getByTestId('code-viewer')).toHaveAttribute('data-theme', 'dark');
  });
});

describe('languageFromFilePath', () => {
  it.each([
    ['/workspace/main.rs', 'rust'],
    ['/workspace/src/App.tsx', 'tsx'],
    ['C:\\workspace\\script.py', 'python'],
    ['/workspace/Dockerfile', 'docker'],
    ['/workspace/.env', 'text'],
  ])('maps %s to %s', (path, language) => {
    expect(languageFromFilePath(path)).toBe(language);
  });
});

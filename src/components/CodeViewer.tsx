import { memo, useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../utils';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsonl: 'json',
  jsx: 'jsx',
  kt: 'kotlin',
  md: 'markdown',
  mdx: 'markdown',
  php: 'php',
  proto: 'protobuf',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  swift: 'swift',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
};

const LANGUAGE_BY_FILENAME: Record<string, string> = {
  dockerfile: 'docker',
  makefile: 'makefile',
};

export function languageFromFilePath(path: string): string {
  const fileName = path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  const knownFileName = LANGUAGE_BY_FILENAME[fileName];
  if (knownFileName) return knownFileName;

  const extension = fileName.includes('.') ? fileName.split('.').pop()! : '';
  return LANGUAGE_BY_EXTENSION[extension] ?? 'text';
}

function isDarkDocumentTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

function useDocumentTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    isDarkDocumentTheme() ? 'dark' : 'light'
  );

  useEffect(() => {
    const syncTheme = () => setTheme(isDarkDocumentTheme() ? 'dark' : 'light');
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

interface CodeViewerProps {
  code: string;
  language: string;
  className?: string;
  showLineNumbers?: boolean;
  wrapLongLines?: boolean;
  surface?: 'primary' | 'secondary';
}

const CodeViewer = memo(function CodeViewer({
  code,
  language,
  className,
  showLineNumbers = false,
  wrapLongLines = false,
  surface = 'secondary',
}: CodeViewerProps) {
  const fontSize = 'var(--code-font-size, 13px)';
  const theme = useDocumentTheme();
  const backgroundColor =
    surface === 'primary' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';

  return (
    <div
      className={cn('min-w-0 overflow-auto', className)}
      data-testid="code-viewer"
      data-language={language}
      data-theme={theme}
    >
      <SyntaxHighlighter
        style={theme === 'dark' ? oneDark : oneLight}
        language={language}
        showLineNumbers={showLineNumbers}
        wrapLongLines={wrapLongLines}
        PreTag="div"
        customStyle={{
          margin: 0,
          minHeight: '100%',
          minWidth: '100%',
          width: wrapLongLines ? '100%' : 'max-content',
          borderRadius: 0,
          backgroundColor,
          padding: '16px',
          fontSize,
          lineHeight: 1.6,
        }}
        codeTagProps={{
          style: {
            backgroundColor: 'transparent',
            fontFamily: 'var(--font-mono)',
            fontSize,
            lineHeight: 1.6,
            whiteSpace: wrapLongLines ? 'pre-wrap' : 'pre',
            overflowWrap: wrapLongLines ? 'anywhere' : 'normal',
          },
        }}
        lineNumberStyle={{
          minWidth: '2.75em',
          paddingRight: '1em',
          color: 'var(--color-text-tertiary)',
          userSelect: 'none',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
});

export default CodeViewer;

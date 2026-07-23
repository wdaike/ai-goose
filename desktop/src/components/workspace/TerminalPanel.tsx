import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, SquareTerminal, X } from 'lucide-react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { defineMessages, useIntl } from '../../i18n';
import { useWorkspacePanels } from '../../contexts/WorkspacePanelsContext';
import { cn } from '../../utils';

const i18n = defineMessages({
  newTerminal: {
    id: 'terminalPanel.newTerminal',
    defaultMessage: 'New terminal',
  },
  closeTab: {
    id: 'terminalPanel.closeTab',
    defaultMessage: 'Close terminal',
  },
  closePanel: {
    id: 'terminalPanel.closePanel',
    defaultMessage: 'Close panel',
  },
});

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 260;

function resolveThemeColor(cssVariable: string): string {
  const probe = document.createElement('div');
  probe.style.color = `var(${cssVariable})`;
  document.body.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

function terminalTheme(): ITheme {
  const background = resolveThemeColor('--color-background-primary');
  const foreground = resolveThemeColor('--color-text-primary');
  const secondary = resolveThemeColor('--color-text-secondary');
  return {
    background,
    foreground,
    cursor: foreground,
    selectionBackground: 'rgba(128, 128, 128, 0.35)',
    black: background,
    brightBlack: secondary,
  };
}

interface TerminalTab {
  ptyId: string;
  title: string;
}

interface TerminalViewProps {
  ptyId: string;
  active: boolean;
  panelOpen: boolean;
}

function TerminalView({ ptyId, active, panelOpen }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const terminal = new Terminal({
      fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const offData = window.electron.terminal.onData((id, data) => {
      if (id === ptyId) {
        terminal.write(data);
      }
    });
    const inputDisposable = terminal.onData((data) => {
      window.electron.terminal.write(ptyId, data);
    });

    const syncSize = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      fit.fit();
      window.electron.terminal.resize(ptyId, terminal.cols, terminal.rows);
    };
    syncSize();
    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = terminalTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      offData();
      inputDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [ptyId]);

  useEffect(() => {
    if (active && panelOpen) {
      fitRef.current?.fit();
      terminalRef.current?.focus();
    }
  }, [active, panelOpen]);

  return (
    <div className={cn('h-full w-full min-h-0 px-3 py-1', !active && 'hidden')} ref={containerRef} />
  );
}

export default function TerminalPanel() {
  const intl = useIntl();
  const { isBottomPanelOpen, hasBottomPanelMounted, toggleBottomPanel, workingDir } =
    useWorkspacePanels();
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activePtyId, setActivePtyId] = useState<string | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const creatingRef = useRef(false);

  const createTab = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      const ptyId = await window.electron.terminal.create({ cwd: workingDir });
      const title = workingDir.replace(/\/+$/, '').split('/').pop() || workingDir;
      setTabs((current) => [...current, { ptyId, title }]);
      setActivePtyId(ptyId);
    } finally {
      creatingRef.current = false;
    }
  }, [workingDir]);

  const closeTab = useCallback((ptyId: string, killPty: boolean) => {
    if (killPty) {
      window.electron.terminal.kill(ptyId);
    }
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.ptyId === ptyId);
      if (index === -1) return current;
      const next = current.filter((tab) => tab.ptyId !== ptyId);
      setActivePtyId((activeId) =>
        activeId === ptyId ? (next[Math.min(index, next.length - 1)]?.ptyId ?? null) : activeId
      );
      return next;
    });
  }, []);

  useEffect(() => {
    return window.electron.terminal.onExit((id) => closeTab(id, false));
  }, [closeTab]);

  useEffect(() => {
    if (isBottomPanelOpen && tabs.length === 0) {
      void createTab();
    }
  }, [isBottomPanelOpen, tabs.length, createTab]);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = (event.currentTarget.parentElement as HTMLElement).clientHeight;
    const maxHeight = Math.round(window.innerHeight * 0.7);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = startHeight + (startY - moveEvent.clientY);
      setHeight(Math.min(maxHeight, Math.max(MIN_HEIGHT, next)));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  if (!hasBottomPanelMounted) {
    return null;
  }

  return (
    <div
      style={{ height }}
      className={cn(
        'relative flex-shrink-0 flex flex-col min-h-0 border-t border-border-primary bg-background-primary',
        !isBottomPanelOpen && 'hidden'
      )}
    >
      <div
        className="absolute inset-x-0 -top-1 h-2 cursor-row-resize"
        onMouseDown={handleResizeStart}
      />
      <div className="flex items-center gap-1 px-2 pt-1.5">
        {tabs.map((tab) => (
          <div
            key={tab.ptyId}
            role="tab"
            aria-selected={tab.ptyId === activePtyId}
            onClick={() => setActivePtyId(tab.ptyId)}
            className={cn(
              'group flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px]',
              tab.ptyId === activePtyId
                ? 'bg-background-tertiary text-text-primary'
                : 'text-text-secondary hover:bg-background-secondary'
            )}
          >
            <SquareTerminal className="size-3.5" />
            <span className="max-w-[10rem] truncate">{tab.title}</span>
            <button
              type="button"
              aria-label={intl.formatMessage(i18n.closeTab)}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.ptyId, true);
              }}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-background-primary group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          aria-label={intl.formatMessage(i18n.newTerminal)}
          title={intl.formatMessage(i18n.newTerminal)}
          onClick={() => void createTab()}
          className="flex size-6 items-center justify-center rounded-md text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
        >
          <Plus className="size-3.5" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          aria-label={intl.formatMessage(i18n.closePanel)}
          title={intl.formatMessage(i18n.closePanel)}
          onClick={toggleBottomPanel}
          className="flex size-6 items-center justify-center rounded-md text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {tabs.map((tab) => (
          <TerminalView
            key={tab.ptyId}
            ptyId={tab.ptyId}
            active={tab.ptyId === activePtyId}
            panelOpen={isBottomPanelOpen}
          />
        ))}
      </div>
    </div>
  );
}

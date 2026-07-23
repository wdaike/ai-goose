import React, { useEffect, useState } from 'react';
import { IpcRendererEvent } from 'electron';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, PanelBottom, PanelLeft, PanelRight } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { Button } from '../ui/button';
import ChatSessionsContainer from '../ChatSessionsContainer';
import { useChatContext } from '../../contexts/ChatContext';
import {
  WorkspacePanelsProvider,
  useWorkspacePanels,
} from '../../contexts/WorkspacePanelsContext';
import FilesPanel from '../workspace/FilesPanel';
import TerminalPanel from '../workspace/TerminalPanel';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { NavigationProvider, useNavigationContext } from './NavigationContext';
import { Navigation } from './NavigationPanel';
import { NAV_DIMENSIONS, Z_INDEX } from './constants';
import { cn } from '../../utils';
import { UserInput } from '../../types/message';

const i18n = defineMessages({
  openNavigation: {
    id: 'appLayout.openNavigation',
    defaultMessage: 'Open navigation',
  },
  collapseNavigation: {
    id: 'appLayout.collapseNavigation',
    defaultMessage: 'Collapse navigation',
  },
  toggleBottomPanel: {
    id: 'appLayout.toggleBottomPanel',
    defaultMessage: 'Toggle bottom panel',
  },
  toggleSidePanel: {
    id: 'appLayout.toggleSidePanel',
    defaultMessage: 'Toggle side panel',
  },
});

const PanelToggleButton: React.FC<{
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, shortcut, active, onClick, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        onClick={onClick}
        className={cn(
          'no-drag text-text-secondary hover:!bg-background-tertiary hover:text-text-primary',
          active && 'text-text-primary'
        )}
        variant="ghost"
        size="sm"
        shape="round"
        aria-label={label}
        aria-pressed={active}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="flex items-center gap-2">
      {label}
      <span className="text-text-secondary">{shortcut}</span>
    </TooltipContent>
  </Tooltip>
);

interface AppLayoutContentProps {
  activeSessions: Array<{
    sessionId: string;
    initialMessage?: UserInput;
    noAutoSubmit?: boolean;
  }>;
}

const AppLayoutContent: React.FC<AppLayoutContentProps> = ({ activeSessions }) => {
  const intl = useIntl();
  const location = useLocation();
  const safeIsMacOS = (window?.electron?.platform || 'darwin') === 'darwin';
  const chatContext = useChatContext();
  const isOnPairRoute = location.pathname === '/pair';

  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!safeIsMacOS) return;
    window.electron
      .getIsFullScreen()
      .then(setIsFullScreen)
      .catch(() => {});
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => {
      setIsFullScreen(Boolean(args[0]));
    };
    window.electron.on('fullscreen-change', handler);
    return () => window.electron.off('fullscreen-change', handler);
  }, [safeIsMacOS]);

  const { isNavExpanded, setIsNavExpanded } = useNavigationContext();
  const { isBottomPanelOpen, isSidePanelOpen, toggleBottomPanel, toggleSidePanel } =
    useWorkspacePanels();
  const modKey = safeIsMacOS ? '⌘' : 'Ctrl+';

  if (!chatContext) {
    throw new Error('AppLayoutContent must be used within ChatProvider');
  }

  const { setChat } = chatContext;

  const needsTrafficLightInset = safeIsMacOS && !isFullScreen;
  const headerPadding = needsTrafficLightInset ? 'pl-[96px]' : 'pl-4';
  const headerTop = needsTrafficLightInset ? 'top-[14px]' : 'top-[11px]';
  const navToggleTitle = intl.formatMessage(
    isNavExpanded ? i18n.collapseNavigation : i18n.openNavigation
  );

  return (
    <div className="flex flex-1 w-full h-full relative animate-fade-in bg-background-primary flex-row">
      <div
        style={{ zIndex: Z_INDEX.HEADER }}
        className={cn('absolute flex items-center gap-1', headerPadding, headerTop, 'ml-1.5')}
      >
        <Button
          onClick={() => setIsNavExpanded(!isNavExpanded)}
          className="no-drag text-text-secondary hover:!bg-background-tertiary hover:text-text-primary"
          variant="ghost"
          size="sm"
          shape="round"
          title={navToggleTitle}
          aria-label={navToggleTitle}
        >
          {isNavExpanded ? <PanelLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      <div
        style={{ zIndex: Z_INDEX.HEADER }}
        className={cn('absolute right-3 flex items-center gap-1', headerTop)}
      >
        <PanelToggleButton
          label={intl.formatMessage(i18n.toggleBottomPanel)}
          shortcut={`${modKey}J`}
          active={isBottomPanelOpen}
          onClick={toggleBottomPanel}
        >
          <PanelBottom className="w-4 h-4" />
        </PanelToggleButton>
        <PanelToggleButton
          label={intl.formatMessage(i18n.toggleSidePanel)}
          shortcut={`${modKey}P`}
          active={isSidePanelOpen}
          onClick={toggleSidePanel}
        >
          <PanelRight className="w-4 h-4" />
        </PanelToggleButton>
      </div>

      {/* Main content with navigation. The sidebar is flush with the window
          edge and separated from the canvas by a hairline, like Codex. */}
      <div className="flex flex-1 w-full h-full min-h-0 flex-row">
        <motion.div
          key="nav"
          initial={false}
          animate={{ width: isNavExpanded ? NAV_DIMENSIONS.NAV_WIDTH : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          style={{ height: '100%' }}
          className="relative flex-shrink-0 overflow-hidden h-full"
        >
          <div
            className="w-full h-full overflow-hidden"
            style={{ width: NAV_DIMENSIONS.NAV_WIDTH }}
          >
            <Navigation />
          </div>
        </motion.div>

        {/* Main content — no border / no card; just flows on the canvas.
            Column so the terminal panel can dock under both the chat and
            the files side panel, like Codex. */}
        <div className="flex flex-1 min-w-0 min-h-0 flex-col">
          <div className="flex flex-1 min-h-0 flex-row">
            <div className="flex-1 overflow-hidden min-h-0 min-w-0">
              <Outlet />
              {/* Always render ChatSessionsContainer to keep SSE connections alive.
                  When navigating away from /pair, hide it with CSS */}
              <div className={isOnPairRoute ? 'contents' : 'hidden'}>
                <ChatSessionsContainer setChat={setChat} activeSessions={activeSessions} />
              </div>
            </div>
            <FilesPanel />
          </div>
          <TerminalPanel />
        </div>
      </div>
    </div>
  );
};

interface AppLayoutProps {
  activeSessions: Array<{
    sessionId: string;
    initialMessage?: UserInput;
    noAutoSubmit?: boolean;
  }>;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ activeSessions }) => {
  return (
    <NavigationProvider>
      <WorkspacePanelsProvider>
        <AppLayoutContent activeSessions={activeSessions} />
      </WorkspacePanelsProvider>
    </NavigationProvider>
  );
};

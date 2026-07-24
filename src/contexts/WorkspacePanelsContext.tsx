import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getInitialWorkingDir } from '../utils/workingDir';

interface WorkspacePanelsContextValue {
  isBottomPanelOpen: boolean;
  isSidePanelOpen: boolean;
  toggleBottomPanel: () => void;
  toggleSidePanel: () => void;
  /** True once the bottom panel has been opened, so its terminals stay alive while hidden. */
  hasBottomPanelMounted: boolean;
  workingDir: string;
  setWorkingDir: (dir: string) => void;
}

const WorkspacePanelsContext = createContext<WorkspacePanelsContextValue | undefined>(undefined);

export const WorkspacePanelsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [hasBottomPanelMounted, setHasBottomPanelMounted] = useState(false);
  const [workingDir, setWorkingDir] = useState(getInitialWorkingDir);

  const toggleBottomPanel = useCallback(() => {
    setIsBottomPanelOpen((open) => {
      if (!open) {
        setHasBottomPanelMounted(true);
      }
      return !open;
    });
  }, []);

  const toggleSidePanel = useCallback(() => {
    setIsSidePanelOpen((open) => !open);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = (window?.electron?.platform || 'darwin') === 'darwin';
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier || event.shiftKey || event.altKey) return;
      if (event.key === 'j') {
        event.preventDefault();
        toggleBottomPanel();
      } else if (event.key === 'p') {
        event.preventDefault();
        toggleSidePanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleBottomPanel, toggleSidePanel]);

  const value = useMemo(
    () => ({
      isBottomPanelOpen,
      isSidePanelOpen,
      toggleBottomPanel,
      toggleSidePanel,
      hasBottomPanelMounted,
      workingDir,
      setWorkingDir,
    }),
    [
      isBottomPanelOpen,
      isSidePanelOpen,
      toggleBottomPanel,
      toggleSidePanel,
      hasBottomPanelMounted,
      workingDir,
    ]
  );

  return (
    <WorkspacePanelsContext.Provider value={value}>{children}</WorkspacePanelsContext.Provider>
  );
};

export function useWorkspacePanels(): WorkspacePanelsContextValue {
  const context = useContext(WorkspacePanelsContext);
  if (!context) {
    throw new Error('useWorkspacePanels must be used within WorkspacePanelsProvider');
  }
  return context;
}

export function useWorkspacePanelsSafe(): WorkspacePanelsContextValue | undefined {
  return useContext(WorkspacePanelsContext);
}

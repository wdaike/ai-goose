import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

/** react-router stores the position of the current entry in `history.state.idx` */
const historyIndex = () => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/**
 * Back/forward state for the router history, mirroring the browser's own
 * behaviour: a push truncates anything ahead of the current entry, so forward
 * is only available after going back.
 */
export const useHistoryNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [index, setIndex] = useState(historyIndex);
  const [lastIndex, setLastIndex] = useState(historyIndex);

  useEffect(() => {
    const idx = historyIndex();
    setIndex(idx);
    setLastIndex((previous) => (navigationType === 'PUSH' ? idx : Math.max(previous, idx)));
  }, [location, navigationType]);

  const goBack = useCallback(() => navigate(-1), [navigate]);
  const goForward = useCallback(() => navigate(1), [navigate]);

  return { canGoBack: index > 0, canGoForward: index < lastIndex, goBack, goForward };
};

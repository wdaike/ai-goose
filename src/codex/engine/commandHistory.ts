export interface HistoryCursor {
  /** -1 means "not navigating"; the composer shows the user's own draft. */
  index: number;
  inGlobalHistory: boolean;
}

export const IDLE_CURSOR: HistoryCursor = { index: -1, inGlobalHistory: false };

export interface HistoryNavigationInput {
  direction: 'up' | 'down';
  cursor: HistoryCursor;
  savedDraft: string;
  sessionHistory: string[];
  globalHistory: string[];
}

export interface HistoryNavigation {
  cursor: HistoryCursor;
  value: string;
}

/**
 * Walks the session history first, then spills over into the global one, and returns
 * null when the keypress lands nowhere. Entering from the draft picks the list that
 * actually has entries, so an empty session history does not swallow the first press.
 */
export const navigateHistory = ({
  direction,
  cursor,
  savedDraft,
  sessionHistory,
  globalHistory,
}: HistoryNavigationInput): HistoryNavigation | null => {
  const entering = cursor.index === -1;
  const inGlobalHistory = entering ? sessionHistory.length === 0 : cursor.inGlobalHistory;
  const current = inGlobalHistory ? globalHistory : sessionHistory;

  let next: HistoryCursor;
  if (direction === 'up') {
    if (cursor.index < current.length - 1) {
      next = { index: cursor.index + 1, inGlobalHistory };
    } else if (!inGlobalHistory && globalHistory.length > 0) {
      next = { index: 0, inGlobalHistory: true };
    } else {
      return null;
    }
  } else if (cursor.index > 0) {
    next = { index: cursor.index - 1, inGlobalHistory };
  } else if (inGlobalHistory && sessionHistory.length > 0) {
    next = { index: sessionHistory.length - 1, inGlobalHistory: false };
  } else if (cursor.index === 0) {
    next = IDLE_CURSOR;
  } else {
    return null;
  }

  if (next.index === cursor.index && next.inGlobalHistory === cursor.inGlobalHistory) {
    return null;
  }

  if (next.index === -1) {
    return { cursor: next, value: savedDraft };
  }
  const list = next.inGlobalHistory ? globalHistory : sessionHistory;
  return { cursor: next, value: list[next.index] ?? '' };
};

import { describe, expect, it } from 'vitest';
import { IDLE_CURSOR, navigateHistory, type HistoryCursor } from './commandHistory';

const session = ['s0', 's1'];
const global = ['g0', 'g1'];

const up = (cursor: HistoryCursor, overrides = {}) =>
  navigateHistory({
    direction: 'up',
    cursor,
    savedDraft: 'draft',
    sessionHistory: session,
    globalHistory: global,
    ...overrides,
  });

const down = (cursor: HistoryCursor, overrides = {}) =>
  navigateHistory({
    direction: 'down',
    cursor,
    savedDraft: 'draft',
    sessionHistory: session,
    globalHistory: global,
    ...overrides,
  });

describe('walking up', () => {
  it('enters the session history from the draft', () => {
    expect(up(IDLE_CURSOR)).toEqual({
      cursor: { index: 0, inGlobalHistory: false },
      value: 's0',
    });
  });

  it('advances within the session history', () => {
    expect(up({ index: 0, inGlobalHistory: false })).toEqual({
      cursor: { index: 1, inGlobalHistory: false },
      value: 's1',
    });
  });

  it('spills into the global history at the top of the session list', () => {
    expect(up({ index: 1, inGlobalHistory: false })).toEqual({
      cursor: { index: 0, inGlobalHistory: true },
      value: 'g0',
    });
  });

  it('enters the global history directly when the session has none', () => {
    expect(up(IDLE_CURSOR, { sessionHistory: [] })).toEqual({
      cursor: { index: 0, inGlobalHistory: true },
      value: 'g0',
    });
  });

  it('spills over even when the index happens to match', () => {
    // Session history of one: the cursor sits at 0 and global index 0 is also 0
    expect(up({ index: 0, inGlobalHistory: false }, { sessionHistory: ['only'] })).toEqual({
      cursor: { index: 0, inGlobalHistory: true },
      value: 'g0',
    });
  });

  it('stops at the top of the global history', () => {
    expect(up({ index: 1, inGlobalHistory: true })).toBeNull();
  });

  it('does nothing when both histories are empty', () => {
    expect(up(IDLE_CURSOR, { sessionHistory: [], globalHistory: [] })).toBeNull();
  });
});

describe('walking down', () => {
  it('steps back toward the newest entry', () => {
    expect(down({ index: 1, inGlobalHistory: false })).toEqual({
      cursor: { index: 0, inGlobalHistory: false },
      value: 's0',
    });
  });

  it('returns to the draft from the newest session entry', () => {
    expect(down({ index: 0, inGlobalHistory: false })).toEqual({
      cursor: IDLE_CURSOR,
      value: 'draft',
    });
  });

  it('crosses back from the global history into the session one', () => {
    expect(down({ index: 0, inGlobalHistory: true })).toEqual({
      cursor: { index: 1, inGlobalHistory: false },
      value: 's1',
    });
  });

  it('returns to the draft when there is no session history to cross into', () => {
    expect(down({ index: 0, inGlobalHistory: true }, { sessionHistory: [] })).toEqual({
      cursor: IDLE_CURSOR,
      value: 'draft',
    });
  });

  it('does nothing while already on the draft', () => {
    expect(down(IDLE_CURSOR)).toBeNull();
  });
});

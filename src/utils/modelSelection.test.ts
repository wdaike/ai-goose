import { describe, expect, it } from 'vitest';
import {
  filterModelGroups,
  findPreferredModel,
  groupsForProvider,
  isSelectableModel,
  type ModelOption,
} from './modelSelection';

const model = (value: string, provider = 'openai'): ModelOption => ({
  value,
  label: value,
  provider,
});

describe('isSelectableModel', () => {
  it('accepts a real model', () => {
    expect(isSelectableModel(model('gpt-4o'))).toBe(true);
  });

  it.each(['custom', '__loading__', '__divider'])('rejects the sentinel %s', (value) => {
    expect(isSelectableModel(model(value))).toBe(false);
  });
});

describe('findPreferredModel', () => {
  it('returns null for an empty list', () => {
    expect(findPreferredModel([])).toBeNull();
  });

  it('returns null when only sentinels are present', () => {
    expect(findPreferredModel([model('custom'), model('__loading__')])).toBeNull();
  });

  it('prefers the strongest family available', () => {
    expect(findPreferredModel([model('gpt-4o-mini'), model('claude-sonnet-4')])).toBe(
      'claude-sonnet-4'
    );
  });

  it('respects the order of the preference list, not the input order', () => {
    expect(findPreferredModel([model('gemini-pro'), model('gpt-4o')])).toBe('gpt-4o');
  });

  it('does not let gpt-4o-mini satisfy the gpt-4o rule', () => {
    // gpt-4o's pattern excludes -mini, so gemini-pro (listed earlier) wins
    expect(findPreferredModel([model('gpt-4o-mini'), model('gemini-pro')])).toBe('gemini-pro');
  });

  it('does not let gpt-4-turbo satisfy the bare gpt-4 rule', () => {
    expect(findPreferredModel([model('gpt-4-turbo'), model('gpt-4')])).toBe('gpt-4-turbo');
  });

  it('falls back to the first selectable model when nothing is recognised', () => {
    expect(findPreferredModel([model('custom'), model('mystery-1'), model('mystery-2')])).toBe(
      'mystery-1'
    );
  });

  it('matches case-insensitively', () => {
    expect(findPreferredModel([model('Claude-Sonnet-4')])).toBe('Claude-Sonnet-4');
  });
});

describe('filterModelGroups', () => {
  const groups = [
    { options: [model('gpt-4o'), model('gpt-4o-mini'), model('custom')] },
    { options: [model('claude-sonnet-4', 'anthropic')] },
  ];

  it('returns every group untouched for an empty query', () => {
    expect(filterModelGroups(groups, '')).toBe(groups);
    expect(filterModelGroups(groups, '   ')).toBe(groups);
  });

  it('keeps only matching options', () => {
    expect(filterModelGroups(groups, 'mini')).toEqual([{ options: [model('gpt-4o-mini')] }]);
  });

  it('drops groups left with nothing', () => {
    expect(filterModelGroups(groups, 'claude')).toHaveLength(1);
  });

  it('never surfaces the custom-model row', () => {
    expect(filterModelGroups(groups, 'custom')).toEqual([]);
  });

  it('is case insensitive', () => {
    expect(filterModelGroups(groups, 'CLAUDE')[0].options[0].value).toBe('claude-sonnet-4');
  });

  it('returns nothing when the query matches no model', () => {
    expect(filterModelGroups(groups, 'zzz')).toEqual([]);
  });
});

describe('groupsForProvider', () => {
  const groups = [
    { options: [model('gpt-4o', 'openai')] },
    { options: [model('claude-sonnet-4', 'anthropic')] },
    { options: [] },
  ];

  it('keeps groups whose first option belongs to the provider', () => {
    expect(groupsForProvider(groups, 'anthropic')).toEqual([
      { options: [model('claude-sonnet-4', 'anthropic')] },
    ]);
  });

  it('skips empty groups instead of throwing', () => {
    expect(groupsForProvider(groups, 'nobody')).toEqual([]);
  });
});

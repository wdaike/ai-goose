import { describe, expect, it } from 'vitest';
import {
  compareByType,
  fuzzyMatch,
  mentionInsertText,
  rankMentionItems,
  type DisplayItem,
  type DisplayItemType,
} from './mentionRanking';

const CWD = '/repo';

const item = (
  name: string,
  itemType: DisplayItemType = 'File',
  extra = `${CWD}/${name}`,
  relativePath = name
): DisplayItem => ({ name, itemType, extra, relativePath });

const rank = (items: DisplayItem[], query: string, workingDir = CWD) =>
  rankMentionItems(items, query, workingDir).map((i) => i.name);

describe('fuzzyMatch', () => {
  it('scores an empty pattern as neutral', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, matches: [] });
  });

  it('rejects a pattern that is not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'abc')).toEqual({ score: -1, matches: [] });
  });

  it('rejects a pattern only partially consumed', () => {
    expect(fuzzyMatch('abcd', 'abc').score).toBe(-1);
  });

  it('is case insensitive', () => {
    expect(fuzzyMatch('AB', 'ab').score).toBeGreaterThan(0);
  });

  it('reports the matched character positions', () => {
    expect(fuzzyMatch('ac', 'abc').matches).toEqual([0, 2]);
  });

  it('prefers consecutive characters over scattered ones', () => {
    expect(fuzzyMatch('ab', 'abzz').score).toBeGreaterThan(fuzzyMatch('ab', 'azbz').score);
  });

  it('rewards a hit at a word boundary', () => {
    expect(fuzzyMatch('b', 'a_b').score).toBeGreaterThan(fuzzyMatch('b', 'aab').score);
  });

  it('rewards the start of a filename over mid-path', () => {
    expect(fuzzyMatch('f', 'src/foo').score).toBeGreaterThan(fuzzyMatch('f', 'srcxfoo').score);
  });

  it('rewards an exact substring', () => {
    expect(fuzzyMatch('foo', 'foo').score).toBeGreaterThan(fuzzyMatch('foo', 'fxoxo').score);
  });

  it('penalises longer text at equal quality', () => {
    expect(fuzzyMatch('foo', 'foo').score).toBeGreaterThan(fuzzyMatch('foo', 'foobarbaz').score);
  });
});

describe('compareByType', () => {
  it('orders agents before directories before files', () => {
    const order: DisplayItemType[] = ['Agent', 'Directory', 'File', 'Builtin', 'Skill', 'Recipe'];
    const shuffled = [...order].reverse().map((t) => item('x', t));
    expect(shuffled.sort(compareByType).map((i) => i.itemType)).toEqual(order);
  });
});

describe('rankMentionItems with no query', () => {
  it('lists shallow paths first', () => {
    const deep = item('deep', 'File', `${CWD}/a/b/c/deep`);
    const shallow = item('shallow', 'File', `${CWD}/shallow`);
    expect(rank([deep, shallow], '')).toEqual(['shallow', 'deep']);
  });

  it('breaks depth ties by type then name', () => {
    const file = item('a-file', 'File', `${CWD}/a-file`);
    const dir = item('z-dir', 'Directory', `${CWD}/z-dir`);
    expect(rank([file, dir], '')).toEqual(['z-dir', 'a-file']);
  });

  it('treats whitespace as no query', () => {
    expect(rank([item('b'), item('a')], '   ')).toEqual(['a', 'b']);
  });

  it('assigns no score and highlights nothing', () => {
    const [only] = rankMentionItems([item('a')], '', CWD);
    expect(only).toMatchObject({ matchScore: 0, matches: [], matchedText: 'a' });
  });
});

describe('rankMentionItems with a query', () => {
  it('drops items the query cannot match', () => {
    expect(rank([item('alpha'), item('beta')], 'alp')).toEqual(['alpha']);
  });

  it('matches against the full path, not just the name', () => {
    const nested = item('index.ts', 'File', `${CWD}/widgets/index.ts`, 'widgets/index.ts');
    expect(rank([nested], 'widgets')).toEqual(['index.ts']);
  });

  it('reports the name when the name is the best field', () => {
    const nested = item('index.ts', 'File', `${CWD}/widgets/index.ts`, 'widgets/index.ts');
    const [result] = rankMentionItems([nested], 'index', CWD);
    expect(result.matchedText).toBe('index.ts');
  });

  it('reports the path when a query lands on a path segment', () => {
    const nested = item('index.ts', 'File', `${CWD}/widgets/index.ts`, 'widgets/index.ts');
    const [result] = rankMentionItems([nested], 'widgets', CWD);
    expect(result.matchedText).toBe(`${CWD}/widgets/index.ts`);
  });

  it('floats agents above equally-matching files', () => {
    const file = item('review', 'File', `${CWD}/review`);
    const agent = item('review', 'Agent', `${CWD}/review`);
    const [first] = rankMentionItems([file, agent], 'review', CWD);
    expect(first.itemType).toBe('Agent');
  });

  it('prefers files near the working directory', () => {
    const near = item('config.ts', 'File', `${CWD}/config.ts`);
    const far = item('config.ts', 'File', `${CWD}/a/b/c/d/config.ts`);
    const ranked = rankMentionItems([far, near], 'config', CWD);
    expect(ranked[0].extra).toBe(`${CWD}/config.ts`);
  });

  it('falls back to type then name when scores are within a point', () => {
    const a = item('same', 'File', `${CWD}/same`);
    const b = { ...item('same', 'Directory', `${CWD}/same`) };
    const ranked = rankMentionItems([a, b], 'same', CWD);
    expect(ranked[0].itemType).toBe('Directory');
  });

  it('works without a working directory', () => {
    expect(rank([item('alpha', 'File', 'alpha')], 'alp', '')).toEqual(['alpha']);
  });
});

describe('mentionInsertText', () => {
  it('honours an explicit insertText', () => {
    expect(mentionInsertText({ ...item('x'), insertText: 'custom' })).toBe('custom');
  });

  it('prefixes agents with @', () => {
    expect(mentionInsertText(item('reviewer', 'Agent'))).toBe('@reviewer ');
  });

  it.each<DisplayItemType>(['Builtin', 'Recipe', 'Skill'])('prefixes %s with /', (type) => {
    expect(mentionInsertText(item('deploy', type))).toBe('/deploy ');
  });

  it('inserts the full path for files and directories', () => {
    expect(mentionInsertText(item('a.ts', 'File', '/repo/a.ts'))).toBe('/repo/a.ts');
    expect(mentionInsertText(item('src', 'Directory', '/repo/src'))).toBe('/repo/src');
  });
});

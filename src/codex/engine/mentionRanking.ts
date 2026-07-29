export type CommandItemType = 'Builtin' | 'Recipe' | 'Skill' | 'Agent';
export type DisplayItemType = CommandItemType | 'Directory' | 'File';

export interface DisplayItem {
  name: string;
  extra: string;
  itemType: DisplayItemType;
  relativePath: string;
  insertText?: string;
}

export interface DisplayItemWithMatch extends DisplayItem {
  matchScore: number;
  /** Indexes into `matchedText` that the query hit, for highlighting. */
  matches: number[];
  matchedText: string;
}

export interface FuzzyMatch {
  score: number;
  matches: number[];
}

const TYPE_ORDER: Record<DisplayItemType, number> = {
  Agent: 0,
  Directory: 1,
  File: 2,
  Builtin: 3,
  Skill: 4,
  Recipe: 5,
};

const WORD_BOUNDARIES = new Set(['/', '_', '-', '.']);

export const compareByType = (a: DisplayItem, b: DisplayItem): number =>
  (TYPE_ORDER[a.itemType] ?? Number.MAX_SAFE_INTEGER) -
  (TYPE_ORDER[b.itemType] ?? Number.MAX_SAFE_INTEGER);

/**
 * Subsequence match scored for how "intentional" the hit looks: runs of adjacent
 * characters, word/path boundaries and filename starts all beat scattered letters.
 * Returns a score of -1 when the pattern is not a subsequence of the text at all.
 */
export const fuzzyMatch = (pattern: string, text: string): FuzzyMatch => {
  if (!pattern) return { score: 0, matches: [] };

  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();
  const matches: number[] = [];

  let patternIndex = 0;
  let score = 0;
  let consecutiveMatches = 0;

  for (let i = 0; i < textLower.length && patternIndex < patternLower.length; i++) {
    if (textLower[i] !== patternLower[patternIndex]) {
      consecutiveMatches = 0;
      continue;
    }
    matches.push(i);
    patternIndex++;
    consecutiveMatches++;
    score += consecutiveMatches * 3;

    if (i === 0 || WORD_BOUNDARIES.has(textLower[i - 1])) {
      score += 10;
    }

    const lastSlash = textLower.lastIndexOf('/', i);
    if (lastSlash !== -1 && i === lastSlash + 1) {
      score += 15;
    }
  }

  if (patternIndex < patternLower.length) {
    return { score: -1, matches: [] };
  }

  // Mild length penalty so nested paths can still rank well
  score -= text.length * 0.05;
  if (textLower.includes(patternLower)) {
    score += 20;
  }
  const fileName = text.split('/').pop()?.toLowerCase() || '';
  if (fileName.includes(patternLower)) {
    score += 25;
  }

  return { score, matches };
};

const pathDepth = (item: DisplayItem, workingDir: string): number =>
  item.extra.replace(workingDir, '').split('/').length - 1;

const proximityBonus = (depth: number): number => {
  if (depth <= 1) return 50;
  if (depth <= 2) return 30;
  if (depth <= 3) return 15;
  return 0;
};

const browseOrder = (items: DisplayItem[], workingDir: string): DisplayItemWithMatch[] =>
  items
    .map((item) => ({
      item,
      depth: workingDir ? pathDepth(item, workingDir) : 0,
    }))
    .sort(
      (a, b) =>
        a.depth - b.depth || compareByType(a.item, b.item) || a.item.name.localeCompare(b.item.name)
    )
    .map(({ item }) => ({ ...item, matchScore: 0, matches: [], matchedText: item.name }));

/**
 * With no query this is a shallow-first browse listing; with one, every item is scored
 * against its name, relative path and full path, keeping whichever field matched best.
 */
export const rankMentionItems = (
  items: DisplayItem[],
  query: string,
  workingDir: string
): DisplayItemWithMatch[] => {
  if (!query.trim()) {
    return browseOrder(items, workingDir);
  }

  return items
    .map((item) => {
      const candidates = [item.name, item.relativePath, item.extra];
      const best = candidates.reduce(
        (winner, text) => {
          const match = fuzzyMatch(query, text);
          return match.score > winner.match.score ? { match, text } : winner;
        },
        { match: { score: -Infinity, matches: [] as number[] }, text: candidates[0] }
      );

      let matchScore = best.match.score;
      if (matchScore > 0 && item.itemType === 'Agent') {
        matchScore += 100;
      } else if (matchScore > 0 && workingDir) {
        matchScore += proximityBonus(pathDepth(item, workingDir));
      }

      return { ...item, matchScore, matches: best.match.matches, matchedText: best.text };
    })
    .filter((item) => item.matchScore > 0)
    .sort((a, b) => {
      const scoreDiff = b.matchScore - a.matchScore;
      // Scores within a point of each other are treated as a tie
      if (Math.abs(scoreDiff) >= 1) return scoreDiff;
      return compareByType(a, b) || a.name.localeCompare(b.name);
    });
};

const SLASH_TYPES: DisplayItemType[] = ['Builtin', 'Recipe', 'Skill'];

export const mentionInsertText = (item: DisplayItem): string => {
  if (item.insertText) return item.insertText;
  if (item.itemType === 'Agent') return `@${item.name} `;
  if (SLASH_TYPES.includes(item.itemType)) return `/${item.name} `;
  return item.extra;
};

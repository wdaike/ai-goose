export interface ModelOption {
  value: string;
  label: string;
  provider: string;
}

export interface ModelOptionGroup {
  options: ModelOption[];
}

/** Sentinel option values the picker uses for its own rows, never real models. */
const SENTINEL_PREFIX = '__';
const CUSTOM_OPTION = 'custom';

/**
 * Best-first ordering used to pick a sensible default when the user has not chosen a
 * model yet. Earlier patterns win, so the strongest generally-available models come
 * first and the cheap variants trail their families.
 */
const PREFERRED_MODEL_PATTERNS = [
  /claude-sonnet-4/i,
  /claude-4/i,
  /gpt-4o(?!-mini)/i,
  /claude-3-5-sonnet/i,
  /claude-3\.5-sonnet/i,
  /gpt-4-turbo/i,
  /gpt-4(?!-|o)/i,
  /claude-3-opus/i,
  /claude-3-sonnet/i,
  /gemini-pro/i,
  /llama-3/i,
  /gpt-4o-mini/i,
  /claude-3-haiku/i,
  /gemini/i,
];

export const isSelectableModel = (option: ModelOption): boolean =>
  option.value !== CUSTOM_OPTION && !option.value.startsWith(SENTINEL_PREFIX);

/** The strongest known model on offer, falling back to whatever is listed first. */
export const findPreferredModel = (models: ModelOption[]): string | null => {
  const selectable = models.filter(isSelectableModel);
  if (selectable.length === 0) return null;

  for (const pattern of PREFERRED_MODEL_PATTERNS) {
    const match = selectable.find((model) => pattern.test(model.value));
    if (match) return match.value;
  }

  return selectable[0].value;
};

/** Substring search over model ids, dropping groups left with nothing to show. */
export const filterModelGroups = (
  groups: ModelOptionGroup[],
  query: string
): ModelOptionGroup[] => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return groups;

  return groups
    .map((group) => ({
      options: group.options.filter(
        (option) => option.value.toLowerCase().includes(needle) && option.value !== CUSTOM_OPTION
      ),
    }))
    .filter((group) => group.options.length > 0);
};

export const groupsForProvider = (
  groups: ModelOptionGroup[],
  provider: string
): ModelOptionGroup[] => groups.filter((group) => group.options[0]?.provider === provider);

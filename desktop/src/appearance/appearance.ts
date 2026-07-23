/**
 * Appearance settings — ChatGPT-style appearance preferences.
 *
 * Stored in localStorage (UI-only prefs with no codex home) and applied to
 * the document as CSS variable overrides / root classes. Overrides layer on
 * top of the base theme tokens, so they must be re-applied after
 * applyThemeTokens() whenever the resolved theme changes.
 */

export type ThemeColors = {
  accent: string;
  background: string;
  foreground: string;
};

export type ReduceMotionSetting = 'system' | 'on' | 'off';
export type DiffMarkersSetting = 'color' | 'markers';

export type AppearanceSettings = {
  themes: {
    light: ThemeColors;
    dark: ThemeColors;
  };
  uiFont: string;
  codeFont: string;
  translucentSidebar: boolean;
  contrast: number;
  pointerCursors: boolean;
  reduceMotion: ReduceMotionSetting;
  uiFontSize: number;
  codeFontSize: number;
  diffMarkers: DiffMarkersSetting;
  fontSmoothing: boolean;
};

export const CODEX_THEME_PRESET: AppearanceSettings['themes'] = {
  light: { accent: '#339CFF', background: '#FFFFFF', foreground: '#1A1C1F' },
  dark: { accent: '#339CFF', background: '#212121', foreground: '#ECECEC' },
};

export const DEFAULT_UI_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
export const DEFAULT_CODE_FONT =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themes: CODEX_THEME_PRESET,
  uiFont: DEFAULT_UI_FONT,
  codeFont: DEFAULT_CODE_FONT,
  translucentSidebar: true,
  contrast: 45,
  pointerCursors: false,
  reduceMotion: 'system',
  uiFontSize: 14,
  codeFontSize: 12,
  diffMarkers: 'color',
  fontSmoothing: true,
};

const STORAGE_KEY = 'appearance-settings';
const CODEX_THEME_PREFIX = 'codex-theme-v1:';

type CodexThemeExport = {
  variant?: 'light' | 'dark';
  theme?: {
    accent?: string;
    surface?: string;
    ink?: string;
    contrast?: number;
    opaqueWindows?: boolean;
    fonts?: { ui?: string; code?: string };
  };
};

export type ThemeImport = Partial<Omit<AppearanceSettings, 'themes'>> & {
  themes?: { light?: Partial<ThemeColors>; dark?: Partial<ThemeColors> };
};

/**
 * Parse a ChatGPT/Codex desktop `codex-theme-v1:{...}` theme export. Imported
 * fonts get the default stacks appended so locally missing fonts fall back to
 * the stock look. Throws on any other format.
 */
export function parseThemeImport(text: string): ThemeImport {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CODEX_THEME_PREFIX)) {
    throw new Error(`Theme import must start with "${CODEX_THEME_PREFIX}"`);
  }
  const { variant = 'light', theme = {} } = JSON.parse(
    trimmed.slice(CODEX_THEME_PREFIX.length)
  ) as CodexThemeExport;
  return {
    themes: {
      [variant]: {
        ...(theme.accent && { accent: theme.accent }),
        ...(theme.surface && { background: theme.surface }),
        ...(theme.ink && { foreground: theme.ink }),
      },
    },
    ...(theme.fonts?.ui && { uiFont: `${theme.fonts.ui}, ${DEFAULT_UI_FONT}` }),
    ...(theme.fonts?.code && { codeFont: `${theme.fonts.code}, ${DEFAULT_CODE_FONT}` }),
    ...(typeof theme.contrast === 'number' && { contrast: theme.contrast }),
    ...(typeof theme.opaqueWindows === 'boolean' && { translucentSidebar: !theme.opaqueWindows }),
  };
}

export function cloneThemePreset(): AppearanceSettings['themes'] {
  return {
    light: { ...CODEX_THEME_PRESET.light },
    dark: { ...CODEX_THEME_PRESET.dark },
  };
}

function cloneDefaults(): AppearanceSettings {
  return { ...DEFAULT_APPEARANCE, themes: cloneThemePreset() };
}

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
    return {
      ...cloneDefaults(),
      ...parsed,
      themes: {
        light: { ...CODEX_THEME_PRESET.light, ...parsed.themes?.light },
        dark: { ...CODEX_THEME_PRESET.dark, ...parsed.themes?.dark },
      },
    };
  } catch {
    return cloneDefaults();
  }
}

export function saveAppearance(settings: AppearanceSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyAppearance(settings);
}

function currentResolvedTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function systemPrefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Map the 0–100 contrast setting to a foreground-mix percentage for borders.
 * The default (45) reproduces the stock border colors (~10% foreground).
 */
function borderMix(contrast: number, base: number): number {
  const normalized = (contrast - 45) / 55;
  const scaled = base + normalized * base * 1.6;
  return Math.min(90, Math.max(2, scaled));
}

export function applyAppearance(settings?: AppearanceSettings): void {
  const s = settings ?? loadAppearance();
  const root = document.documentElement;
  const theme = s.themes[currentResolvedTheme()];

  root.style.setProperty('--appearance-accent', theme.accent);
  root.style.setProperty('--color-background-primary', theme.background);
  root.style.setProperty(
    '--color-background-secondary',
    `color-mix(in srgb, ${theme.foreground} 3%, ${theme.background})`
  );
  root.style.setProperty(
    '--color-background-tertiary',
    `color-mix(in srgb, ${theme.foreground} 8%, ${theme.background})`
  );
  root.style.setProperty('--color-text-primary', theme.foreground);
  root.style.setProperty(
    '--color-text-secondary',
    `color-mix(in srgb, ${theme.foreground} 62%, ${theme.background})`
  );
  root.style.setProperty(
    '--color-text-tertiary',
    `color-mix(in srgb, ${theme.foreground} 45%, ${theme.background})`
  );
  root.style.setProperty('--color-background-info', theme.accent);
  root.style.setProperty('--color-text-info', theme.accent);
  root.style.setProperty('--color-border-info', theme.accent);
  root.style.setProperty('--color-ring-info', theme.accent);

  root.style.setProperty('--font-sans', s.uiFont);
  root.style.setProperty('--font-mono', s.codeFont);

  // 14px is the baseline: scale the rem base proportionally.
  root.style.fontSize = `${(s.uiFontSize / 14) * 100}%`;
  root.style.setProperty('--code-font-size', `${s.codeFontSize}px`);

  for (const [name, base] of [
    ['--color-border-primary', 10],
    ['--color-border-secondary', 17],
    ['--color-border-tertiary', 24],
  ] as const) {
    root.style.setProperty(
      name,
      `color-mix(in srgb, var(--color-text-primary) ${borderMix(s.contrast, base)}%, var(--color-background-primary))`
    );
  }

  root.classList.toggle('pointer-cursors', s.pointerCursors);
  root.classList.toggle('translucent-sidebar', s.translucentSidebar);
  root.classList.toggle('no-font-smoothing', !s.fontSmoothing);
  root.classList.toggle(
    'reduce-motion',
    s.reduceMotion === 'on' || (s.reduceMotion === 'system' && systemPrefersReducedMotion())
  );
  root.classList.toggle('diff-markers-plain', s.diffMarkers === 'markers');
}

/**
 * Apply stored settings and keep the reduce-motion class in sync with the OS
 * preference. Call once at startup, after the first applyThemeTokens().
 */
export function initAppearance(): void {
  applyAppearance();
  window
    .matchMedia('(prefers-reduced-motion: reduce)')
    .addEventListener('change', () => applyAppearance());
}

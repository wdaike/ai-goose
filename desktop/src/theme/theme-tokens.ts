/**
 * Theme tokens — the single source of truth for all MCP semantic token values.
 *
 * Every key in McpUiStyleVariableKey must be present in both lightTokens and
 * darkTokens. The TypeScript compiler enforces this: if the SDK adds a new key,
 * the build breaks until both maps are updated.
 *
 * Values are applied to :root via style.setProperty() before first paint
 * (see renderer.tsx). main.css only registers the variable names for Tailwind
 * class generation — it does NOT define values.
 *
 * These tokens serve two purposes:
 *  1. Goose desktop — applied to :root per resolved theme.
 *  2. MCP apps — encoded as light-dark() in hostContext.styles.variables.
 */
import type {
  McpUiHostStyles,
  McpUiStyleVariableKey,
  McpUiStyles,
} from '@modelcontextprotocol/ext-apps/app-bridge';

type ThemeTokens = Record<McpUiStyleVariableKey, string>;

// Subset of keys that are the same across both themes.
type BaseTokenKey = Extract<
  McpUiStyleVariableKey,
  `--font-${string}` | `--border-radius-${string}` | `--border-width-${string}`
>;

type ColorTokenKey = Exclude<McpUiStyleVariableKey, BaseTokenKey>;

// ---------------------------------------------------------------------------
// Base tokens — shared across light and dark themes
// ---------------------------------------------------------------------------
const baseTokens: Pick<ThemeTokens, BaseTokenKey> = {
  // Typography — families
  '--font-sans':
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  '--font-mono': 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',

  // Typography — weights
  '--font-weight-normal': '400',
  '--font-weight-medium': '500',
  '--font-weight-semibold': '600',
  '--font-weight-bold': '700',

  // Typography — text sizes
  '--font-text-xs-size': '0.75rem',
  '--font-text-sm-size': '0.875rem',
  '--font-text-md-size': '1rem',
  '--font-text-lg-size': '1.125rem',

  // Typography — heading sizes
  '--font-heading-xs-size': '1rem',
  '--font-heading-sm-size': '1.125rem',
  '--font-heading-md-size': '1.25rem',
  '--font-heading-lg-size': '1.5rem',
  '--font-heading-xl-size': '1.875rem',
  '--font-heading-2xl-size': '2.25rem',
  '--font-heading-3xl-size': '3rem',

  // Typography — text line heights
  '--font-text-xs-line-height': '1rem',
  '--font-text-sm-line-height': '1.25rem',
  '--font-text-md-line-height': '1.5rem',
  '--font-text-lg-line-height': '1.75rem',

  // Typography — heading line heights
  '--font-heading-xs-line-height': '1.5rem',
  '--font-heading-sm-line-height': '1.75rem',
  '--font-heading-md-line-height': '1.75rem',
  '--font-heading-lg-line-height': '2rem',
  '--font-heading-xl-line-height': '2.25rem',
  '--font-heading-2xl-line-height': '2.5rem',
  '--font-heading-3xl-line-height': '3.5rem',

  // Border radius
  '--border-radius-xs': '2px',
  '--border-radius-sm': '4px',
  '--border-radius-md': '8px',
  '--border-radius-lg': '12px',
  '--border-radius-xl': '16px',
  '--border-radius-full': '9999px',

  // Border width
  '--border-width-regular': '1px',
};

// Theme-specific color/shadow tokens only.
type ColorTokens = Pick<ThemeTokens, ColorTokenKey>;

// ---------------------------------------------------------------------------
// Light theme — colors & shadows
// ---------------------------------------------------------------------------
const lightColorTokens: ColorTokens = {
  // Backgrounds
  '--color-background-primary': '#ffffff',
  '--color-background-secondary': '#f7f7f7',
  '--color-background-tertiary': '#ececec',
  '--color-background-inverse': '#1a1a1a',
  '--color-background-ghost': 'transparent',
  '--color-background-info': '#5c98f9',
  '--color-background-danger': '#e5484d',
  '--color-background-success': '#4c9a5a',
  '--color-background-warning': '#e5a83c',
  '--color-background-disabled': '#ececec',

  // Text
  '--color-text-primary': '#1a1a1a',
  '--color-text-secondary': '#6b6b6b',
  '--color-text-tertiary': '#9b9b9b',
  '--color-text-inverse': '#ffffff',
  '--color-text-ghost': '#6b6b6b',
  '--color-text-info': '#5c98f9',
  '--color-text-danger': '#e5484d',
  '--color-text-success': '#4c9a5a',
  '--color-text-warning': '#b7791f',
  '--color-text-disabled': '#c4c4c4',

  // Borders
  '--color-border-primary': '#e5e5e5',
  '--color-border-secondary': '#d4d4d4',
  '--color-border-tertiary': '#c4c4c4',
  '--color-border-inverse': '#1a1a1a',
  '--color-border-ghost': 'transparent',
  '--color-border-info': '#5c98f9',
  '--color-border-danger': '#e5484d',
  '--color-border-success': '#4c9a5a',
  '--color-border-warning': '#e5a83c',
  '--color-border-disabled': '#e5e5e5',

  // Rings
  '--color-ring-primary': '#d4d4d4',
  '--color-ring-secondary': '#c4c4c4',
  '--color-ring-inverse': '#ffffff',
  '--color-ring-info': '#5c98f9',
  '--color-ring-danger': '#f94b4b',
  '--color-ring-success': '#91cb80',
  '--color-ring-warning': '#fbcd44',

  // Shadows
  '--shadow-hairline': '0 0 0 1px rgba(0, 0, 0, 0.05)',
  '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
};

// ---------------------------------------------------------------------------
// Dark theme — colors & shadows
// ---------------------------------------------------------------------------
const darkColorTokens: ColorTokens = {
  // Backgrounds
  '--color-background-primary': '#1a1a1a',
  '--color-background-secondary': '#212121',
  '--color-background-tertiary': '#2e2e2e',
  '--color-background-inverse': '#ededed',
  '--color-background-ghost': 'transparent',
  '--color-background-info': '#7cacff',
  '--color-background-danger': '#e5484d',
  '--color-background-success': '#5bb374',
  '--color-background-warning': '#e5a83c',
  '--color-background-disabled': '#2e2e2e',

  // Text
  '--color-text-primary': '#ededed',
  '--color-text-secondary': '#8f8f8f',
  '--color-text-tertiary': '#6b6b6b',
  '--color-text-inverse': '#1a1a1a',
  '--color-text-ghost': '#8f8f8f',
  '--color-text-info': '#7cacff',
  '--color-text-danger': '#ff6369',
  '--color-text-success': '#5bb374',
  '--color-text-warning': '#e5a83c',
  '--color-text-disabled': '#5a5a5a',

  // Borders
  '--color-border-primary': '#2a2a2a',
  '--color-border-secondary': '#3a3a3a',
  '--color-border-tertiary': '#4a4a4a',
  '--color-border-inverse': '#ededed',
  '--color-border-ghost': 'transparent',
  '--color-border-info': '#7cacff',
  '--color-border-danger': '#e5484d',
  '--color-border-success': '#5bb374',
  '--color-border-warning': '#e5a83c',
  '--color-border-disabled': '#2a2a2a',

  // Rings
  '--color-ring-primary': '#3a3a3a',
  '--color-ring-secondary': '#4a4a4a',
  '--color-ring-inverse': '#000000',
  '--color-ring-info': '#7cacff',
  '--color-ring-danger': '#ff6b6b',
  '--color-ring-success': '#a3d795',
  '--color-ring-warning': '#ffd966',

  // Shadows (darker for dark mode)
  '--shadow-hairline': '0 0 0 1px rgba(0, 0, 0, 0.2)',
  '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.2)',
  '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
  '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2)',
};

// ---------------------------------------------------------------------------
// Merged token maps — used by applyThemeTokens() and buildMcpHostStyles()
// ---------------------------------------------------------------------------
export const lightTokens: ThemeTokens = { ...baseTokens, ...lightColorTokens };
export const darkTokens: ThemeTokens = { ...baseTokens, ...darkColorTokens };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the McpUiHostStyles object for MCP apps.
 * Color keys use light-dark() so a single payload works for both themes.
 * Non-color keys (fonts, radii, shadows) use plain values from baseTokens
 * (or light as the default when values differ, e.g. shadows).
 */
export function buildMcpHostStyles(): McpUiHostStyles {
  const variables: McpUiStyles = {} as McpUiStyles;
  for (const key of Object.keys(lightTokens) as McpUiStyleVariableKey[]) {
    const light = lightTokens[key];
    const dark = darkTokens[key];
    if (key.startsWith('--color-')) {
      variables[key] = `light-dark(${light}, ${dark})`;
    } else {
      variables[key] = light;
    }
  }
  return { variables };
}

/**
 * Resolve the current theme from localStorage / system preference.
 */
export function getResolvedTheme(): 'light' | 'dark' {
  const useSystem = localStorage.getItem('use_system_theme') !== 'false';
  if (useSystem) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Apply theme tokens to the document root as CSS custom properties.
 * When called without an argument, resolves the theme from localStorage.
 */
export function applyThemeTokens(theme?: 'light' | 'dark'): void {
  const resolved = theme ?? getResolvedTheme();
  const tokens = resolved === 'dark' ? darkTokens : lightTokens;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
}

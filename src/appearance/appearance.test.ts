import { describe, expect, it } from 'vitest';
import {
  CODEX_THEME_PRESET,
  DEFAULT_APPEARANCE,
  DEFAULT_CODE_FONT,
  DEFAULT_UI_FONT,
  isLightColor,
  matchesCodexPreset,
  parseThemeImport,
} from './appearance';

const CODEX_EXPORT =
  'codex-theme-v1:{"codeThemeId":"codex","theme":{"accent":"#0169cc","contrast":40,"fonts":{"code":"\\"Geist Mono\\", ui-monospace, \\"SFMono-Regular\\"","ui":"Geist, Inter"},"ink":"#0d0d0d","opaqueWindows":true,"semanticColors":{"diffAdded":"#00a240","diffRemoved":"#e02e2a","skill":"#751ed9"},"surface":"#ffffff"},"variant":"light"}';

describe('parseThemeImport', () => {
  it('maps a codex-theme-v1 export onto appearance settings', () => {
    const parsed = parseThemeImport(CODEX_EXPORT);

    expect(parsed.themes).toEqual({
      light: { accent: '#0169cc', background: '#ffffff', foreground: '#0d0d0d' },
    });
    expect(parsed.uiFont).toBe(`Geist, Inter, ${DEFAULT_UI_FONT}`);
    expect(parsed.codeFont).toBe(`"Geist Mono", ui-monospace, "SFMono-Regular", ${DEFAULT_CODE_FONT}`);
    expect(parsed.contrast).toBe(40);
    expect(parsed.translucentSidebar).toBe(false);
  });

  it('targets the dark theme when variant is dark', () => {
    const parsed = parseThemeImport(
      'codex-theme-v1:{"theme":{"surface":"#212121","ink":"#ececec"},"variant":"dark"}'
    );

    expect(parsed.themes).toEqual({
      dark: { background: '#212121', foreground: '#ececec' },
    });
    expect(parsed.uiFont).toBeUndefined();
  });

  it('rejects input without the codex-theme-v1 prefix', () => {
    expect(() => parseThemeImport('{"uiFont":"Inter"}')).toThrow();
    expect(() => parseThemeImport('not a theme')).toThrow();
  });

  it('throws on malformed payload JSON', () => {
    expect(() => parseThemeImport('codex-theme-v1:{oops')).toThrow();
  });
});

describe('isLightColor', () => {
  it('reads white and pale colours as light', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#eeeeee')).toBe(true);
  });

  it('reads black and deep colours as dark', () => {
    expect(isLightColor('#000000')).toBe(false);
    expect(isLightColor('#212121')).toBe(false);
  });

  it('weights green far above blue', () => {
    // Full green lands at 149.7 — just under the cutoff — while full blue reaches only 29
    expect(isLightColor('#00ff00')).toBe(false);
    expect(isLightColor('#20ff00')).toBe(true);
    expect(isLightColor('#0000ff')).toBe(false);
    expect(isLightColor('#20ff20')).toBe(true);
  });

  it('accepts a hex with or without the hash, and any case', () => {
    expect(isLightColor('FFFFFF')).toBe(true);
    expect(isLightColor('  #FfFfFf  ')).toBe(true);
  });

  it('falls back to light for anything it cannot parse', () => {
    expect(isLightColor('')).toBe(true);
    expect(isLightColor('#fff')).toBe(true);
    expect(isLightColor('rebeccapurple')).toBe(true);
  });
});

describe('matchesCodexPreset', () => {
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const preset = { ...DEFAULT_APPEARANCE, themes: clone(CODEX_THEME_PRESET) };

  it('recognises untouched defaults', () => {
    expect(matchesCodexPreset(preset)).toBe(true);
  });

  it('notices a recoloured theme', () => {
    const edited = clone(preset);
    edited.themes.light.accent = '#ff0000';
    expect(matchesCodexPreset(edited)).toBe(false);
  });

  it.each([
    ['uiFont', 'Comic Sans'],
    ['contrast', 99],
    ['translucentSidebar', !DEFAULT_APPEARANCE.translucentSidebar],
    ['uiFontSize', 99],
  ] as const)('notices a changed %s', (key, value) => {
    expect(matchesCodexPreset({ ...preset, [key]: value })).toBe(false);
  });
});

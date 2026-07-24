import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CODE_FONT,
  DEFAULT_UI_FONT,
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

import React, { useMemo, useRef, useState } from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { ChevronDown } from 'lucide-react';
import { defineMessages, useIntl } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';
import { SettingsGroup, SettingsSection } from '../SettingsGroup';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import {
  AppearanceSettings,
  CODEX_THEME_PRESET,
  DEFAULT_APPEARANCE,
  DiffMarkersSetting,
  ReduceMotionSetting,
  ThemeColors,
  cloneThemePreset,
  loadAppearance,
  saveAppearance,
} from '../../../appearance/appearance';
import { cn } from '../../../utils';

const i18n = defineMessages({
  themeSection: { id: 'appearance.theme.section', defaultMessage: 'Theme' },
  themeSystem: { id: 'appearance.theme.system', defaultMessage: 'System' },
  themeLight: { id: 'appearance.theme.light', defaultMessage: 'Light' },
  themeDark: { id: 'appearance.theme.dark', defaultMessage: 'Dark' },
  lightTheme: { id: 'appearance.lightTheme', defaultMessage: 'Light theme' },
  darkTheme: { id: 'appearance.darkTheme', defaultMessage: 'Dark theme' },
  import: { id: 'appearance.import', defaultMessage: 'Import' },
  copyTheme: { id: 'appearance.copyTheme', defaultMessage: 'Copy theme' },
  presetCodex: { id: 'appearance.preset.codex', defaultMessage: 'Codex' },
  presetCustom: { id: 'appearance.preset.custom', defaultMessage: 'Custom' },
  accent: { id: 'appearance.accent', defaultMessage: 'Accent' },
  background: { id: 'appearance.background', defaultMessage: 'Background' },
  foreground: { id: 'appearance.foreground', defaultMessage: 'Foreground' },
  uiFont: { id: 'appearance.uiFont', defaultMessage: 'UI font' },
  codeFont: { id: 'appearance.codeFont', defaultMessage: 'Code font' },
  translucentSidebar: {
    id: 'appearance.translucentSidebar',
    defaultMessage: 'Translucent sidebar',
  },
  contrast: { id: 'appearance.contrast', defaultMessage: 'Contrast' },
  preferencesSection: { id: 'appearance.preferences.section', defaultMessage: 'Preferences' },
  pointerCursors: { id: 'appearance.pointerCursors', defaultMessage: 'Use pointer cursors' },
  pointerCursorsDesc: {
    id: 'appearance.pointerCursors.desc',
    defaultMessage: 'Change the cursor to a pointer when hovering over interactive elements',
  },
  reduceMotion: { id: 'appearance.reduceMotion', defaultMessage: 'Reduce motion' },
  reduceMotionDesc: {
    id: 'appearance.reduceMotion.desc',
    defaultMessage: 'Reduce animations or match your system',
  },
  reduceMotionSystem: { id: 'appearance.reduceMotion.system', defaultMessage: 'System' },
  reduceMotionOn: { id: 'appearance.reduceMotion.on', defaultMessage: 'On' },
  reduceMotionOff: { id: 'appearance.reduceMotion.off', defaultMessage: 'Off' },
  uiFontSize: { id: 'appearance.uiFontSize', defaultMessage: 'UI font size' },
  uiFontSizeDesc: {
    id: 'appearance.uiFontSize.desc',
    defaultMessage: 'Adjust the base size used for the iCodex UI',
  },
  codeFontSize: { id: 'appearance.codeFontSize', defaultMessage: 'Code font size' },
  codeFontSizeDesc: {
    id: 'appearance.codeFontSize.desc',
    defaultMessage: 'Adjust the base size used for code across chats and diffs',
  },
  diffMarkers: { id: 'appearance.diffMarkers', defaultMessage: 'Diff markers' },
  diffMarkersDesc: {
    id: 'appearance.diffMarkers.desc',
    defaultMessage: 'Show changes using colors or +/− markers',
  },
  diffMarkersColor: { id: 'appearance.diffMarkers.color', defaultMessage: 'Color' },
  diffMarkersPlain: { id: 'appearance.diffMarkers.plain', defaultMessage: '+/-' },
  fontSmoothing: { id: 'appearance.fontSmoothing', defaultMessage: 'Font smoothing' },
  fontSmoothingDesc: {
    id: 'appearance.fontSmoothing.desc',
    defaultMessage: 'Use native macOS font anti-aliasing',
  },
});

function Toggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <SwitchPrimitives.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        'inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none',
        checked ? 'bg-[var(--appearance-accent,#339CFF)]' : 'bg-background-tertiary'
      )}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </SwitchPrimitives.Root>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-8 rounded-full px-3 text-sm transition-colors',
            option.value === value
              ? 'bg-background-tertiary text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function isLightColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return true;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

function ColorPill({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const light = isLightColor(value);
  return (
    <button
      onClick={() => inputRef.current?.click()}
      className={cn(
        'relative flex h-9 w-[210px] items-center gap-2.5 rounded-full border px-2 transition-colors',
        light ? 'border-border-primary' : 'border-transparent'
      )}
      style={{ backgroundColor: value }}
    >
      <span
        className={cn(
          'h-4 w-4 shrink-0 rounded-full border',
          light ? 'border-black/25' : 'border-white/60'
        )}
      />
      <span className={cn('font-mono text-sm', light ? 'text-black/80' : 'text-white')}>
        {value.toUpperCase()}
      </span>
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-default opacity-0"
        tabIndex={-1}
      />
    </button>
  );
}

function FontInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onChange(draft.trim() || value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      spellCheck={false}
      className="h-9 w-[210px] rounded-full border border-border-primary bg-background-primary px-4 text-sm text-text-secondary focus:border-border-secondary focus-visible:outline-none"
    />
  );
}

function FontSizeInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={8}
        max={32}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next >= 8 && next <= 32) onChange(next);
        }}
        className="h-10 w-[70px] rounded-xl border border-border-primary bg-background-primary text-center text-sm text-text-primary focus:border-border-secondary focus-visible:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-sm text-text-secondary">px</span>
    </div>
  );
}

function ThemeMockup({ dark }: { dark: boolean }) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center',
        dark ? 'bg-[#5a5a5a]' : 'bg-[#d9d9d9]'
      )}
    >
      <div
        className={cn(
          'h-[72%] w-[68%] rounded-lg p-2.5 shadow-sm',
          dark ? 'bg-[#2a2a2a]' : 'bg-white'
        )}
      >
        <div className={cn('mb-2.5 h-1.5 w-3/5 rounded-full', dark ? 'bg-[#4a4a4a]' : 'bg-[#dcdcdc]')} />
        <div className={cn('mb-1.5 h-1 w-4/5 rounded-full', dark ? 'bg-[#3d3d3d]' : 'bg-[#e8e8e8]')} />
        <div className={cn('mb-1.5 h-1 w-2/3 rounded-full', dark ? 'bg-[#3d3d3d]' : 'bg-[#e8e8e8]')} />
        <div className={cn('h-1 w-3/4 rounded-full', dark ? 'bg-[#3d3d3d]' : 'bg-[#e8e8e8]')} />
      </div>
    </div>
  );
}

function ThemePreviewCard({
  label,
  selected,
  variant,
  onSelect,
}: {
  label: string;
  selected: boolean;
  variant: 'system' | 'light' | 'dark';
  onSelect: () => void;
}) {
  return (
    <button onClick={onSelect} className="group flex w-full flex-col items-center gap-2">
      <div
        className={cn(
          'relative h-[120px] w-full overflow-hidden rounded-xl border-2 transition-colors',
          selected
            ? 'border-[var(--appearance-accent,#339CFF)]'
            : 'border-border-primary group-hover:border-border-secondary'
        )}
      >
        {variant === 'system' ? (
          <>
            <div className="absolute inset-0" style={{ clipPath: 'inset(0 50% 0 0)' }}>
              <ThemeMockup dark={false} />
            </div>
            <div className="absolute inset-0" style={{ clipPath: 'inset(0 0 0 50%)' }}>
              <ThemeMockup dark />
            </div>
          </>
        ) : (
          <ThemeMockup dark={variant === 'dark'} />
        )}
      </div>
      <span className={cn('text-sm', selected ? 'text-text-primary' : 'text-text-secondary')}>
        {label}
      </span>
    </button>
  );
}

type DiffToken = { text: string; className?: string };
type DiffLine = { tokens: DiffToken[]; changed: boolean };

const TOKEN = {
  keyword: 'text-blue-600 dark:text-blue-400',
  type: 'text-teal-600 dark:text-teal-400',
  property: 'text-text-primary',
  string: 'text-rose-600 dark:text-rose-400',
  number: 'text-amber-600 dark:text-amber-400',
};

function diffLines(surface: string, accent: string, contrast: string): DiffLine[] {
  return [
    {
      changed: false,
      tokens: [
        { text: 'const ', className: TOKEN.keyword },
        { text: 'themePreview' },
        { text: ': ' },
        { text: 'ThemeConfig', className: TOKEN.type },
        { text: ' = {' },
      ],
    },
    {
      changed: true,
      tokens: [
        { text: '  surface', className: TOKEN.property },
        { text: ': ' },
        { text: `"${surface}"`, className: TOKEN.string },
        { text: ',' },
      ],
    },
    {
      changed: true,
      tokens: [
        { text: '  accent', className: TOKEN.property },
        { text: ': ' },
        { text: `"${accent}"`, className: TOKEN.string },
        { text: ',' },
      ],
    },
    {
      changed: true,
      tokens: [
        { text: '  contrast', className: TOKEN.property },
        { text: ': ' },
        { text: contrast, className: TOKEN.number },
        { text: ',' },
      ],
    },
    { changed: false, tokens: [{ text: '};' }] },
  ];
}

function DiffPane({
  lines,
  side,
  markers,
  codeFontSize,
}: {
  lines: DiffLine[];
  side: 'removed' | 'added';
  markers: DiffMarkersSetting;
  codeFontSize: number;
}) {
  const removed = side === 'removed';
  return (
    <div
      className="min-w-0 flex-1 overflow-x-auto py-2 font-mono"
      style={{ fontSize: codeFontSize, lineHeight: 1.9 }}
    >
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'flex items-center',
            line.changed &&
              markers === 'color' &&
              (removed ? 'bg-red-500/10 dark:bg-red-500/15' : 'bg-emerald-500/10 dark:bg-emerald-500/15')
          )}
        >
          <span
            className={cn(
              'w-1 self-stretch shrink-0',
              line.changed && markers === 'color' && (removed ? 'bg-red-500' : 'bg-emerald-500')
            )}
          />
          <span className="w-10 shrink-0 pr-3 text-right text-text-tertiary select-none">
            {index + 1}
          </span>
          {markers === 'markers' && (
            <span
              className={cn(
                'w-4 shrink-0 select-none',
                line.changed ? (removed ? 'text-red-500' : 'text-emerald-500') : 'text-transparent'
              )}
            >
              {line.changed ? (removed ? '-' : '+') : ' '}
            </span>
          )}
          <span className="whitespace-pre pr-4">
            {line.tokens.map((token, i) => (
              <span key={i} className={token.className ?? 'text-text-primary'}>
                {token.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function DiffPreview({ settings }: { settings: AppearanceSettings }) {
  const before = diffLines('sidebar', '#2563eb', '42');
  const after = diffLines('sidebar-elevated', '#0ea5e9', '68');
  return (
    <div className="mt-6 flex overflow-hidden rounded-xl border border-border-primary bg-background-primary">
      <DiffPane
        lines={before}
        side="removed"
        markers={settings.diffMarkers}
        codeFontSize={settings.codeFontSize}
      />
      <div className="w-px shrink-0 bg-border-primary" />
      <DiffPane
        lines={after}
        side="added"
        markers={settings.diffMarkers}
        codeFontSize={settings.codeFontSize}
      />
    </div>
  );
}

function ThemeRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <h3 className="text-sm text-text-primary">{title}</h3>
        {description && <p className="mt-1 max-w-xl text-sm text-text-secondary">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

export default function AppearanceSection() {
  const intl = useIntl();
  const { userThemePreference, setUserThemePreference, resolvedTheme } = useTheme();
  const [settings, setSettings] = useState<AppearanceSettings>(loadAppearance);
  const importInputRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<AppearanceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveAppearance(next);
      return next;
    });
  };

  const themeColors = settings.themes[resolvedTheme];
  const updateThemeColor = (partial: Partial<ThemeColors>) => {
    update({
      themes: {
        ...settings.themes,
        [resolvedTheme]: { ...themeColors, ...partial },
      },
    });
  };

  const isCodexPreset = useMemo(
    () =>
      JSON.stringify(settings.themes) === JSON.stringify(CODEX_THEME_PRESET) &&
      settings.uiFont === DEFAULT_APPEARANCE.uiFont &&
      settings.codeFont === DEFAULT_APPEARANCE.codeFont,
    [settings]
  );

  const handleCopyTheme = () => {
    const { themes, uiFont, codeFont, translucentSidebar, contrast } = settings;
    navigator.clipboard.writeText(
      JSON.stringify({ themes, uiFont, codeFont, translucentSidebar, contrast }, null, 2)
    );
  };

  const handleImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppearanceSettings>;
      update({
        ...(parsed.themes && {
          themes: {
            light: { ...settings.themes.light, ...parsed.themes.light },
            dark: { ...settings.themes.dark, ...parsed.themes.dark },
          },
        }),
        ...(typeof parsed.uiFont === 'string' && { uiFont: parsed.uiFont }),
        ...(typeof parsed.codeFont === 'string' && { codeFont: parsed.codeFont }),
        ...(typeof parsed.translucentSidebar === 'boolean' && {
          translucentSidebar: parsed.translucentSidebar,
        }),
        ...(typeof parsed.contrast === 'number' && { contrast: parsed.contrast }),
      });
    } catch (error) {
      console.warn('[Appearance] Failed to import theme:', error);
    }
  };

  const handlePresetChange = (value: string) => {
    if (value === 'codex') {
      update({
        themes: cloneThemePreset(),
        uiFont: DEFAULT_APPEARANCE.uiFont,
        codeFont: DEFAULT_APPEARANCE.codeFont,
      });
    }
  };

  return (
    <div className="pb-8">
      <SettingsSection title={intl.formatMessage(i18n.themeSection)}>
        <div className="mt-6 grid grid-cols-3 gap-6">
          <ThemePreviewCard
            label={intl.formatMessage(i18n.themeSystem)}
            variant="system"
            selected={userThemePreference === 'system'}
            onSelect={() => setUserThemePreference('system')}
          />
          <ThemePreviewCard
            label={intl.formatMessage(i18n.themeLight)}
            variant="light"
            selected={userThemePreference === 'light'}
            onSelect={() => setUserThemePreference('light')}
          />
          <ThemePreviewCard
            label={intl.formatMessage(i18n.themeDark)}
            variant="dark"
            selected={userThemePreference === 'dark'}
            onSelect={() => setUserThemePreference('dark')}
          />
        </div>

        <DiffPreview settings={settings} />

        <div className="mt-6 rounded-2xl border border-border-primary bg-background-primary px-5">
          <div className="flex items-center justify-between gap-4 py-4">
            <h3 className="text-sm font-medium text-text-primary">
              {intl.formatMessage(resolvedTheme === 'dark' ? i18n.darkTheme : i18n.lightTheme)}
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => importInputRef.current?.click()}
                className="h-8 rounded-lg px-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                {intl.formatMessage(i18n.import)}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={handleCopyTheme}
                className="h-8 rounded-lg px-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                {intl.formatMessage(i18n.copyTheme)}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="ml-2 flex h-9 items-center gap-2 rounded-xl border border-border-primary bg-background-primary px-3 text-sm text-text-primary transition-colors hover:border-border-secondary">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-[var(--appearance-accent,#339CFF)] text-[10px] font-semibold text-[var(--appearance-accent,#339CFF)]">
                    Aa
                  </span>
                  <span>
                    {intl.formatMessage(isCodexPreset ? i18n.presetCodex : i18n.presetCustom)}
                  </span>
                  <ChevronDown className="h-4 w-4 text-text-tertiary" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[180px]">
                  <DropdownMenuRadioGroup
                    value={isCodexPreset ? 'codex' : 'custom'}
                    onValueChange={handlePresetChange}
                  >
                    <DropdownMenuRadioItem value="codex">
                      {intl.formatMessage(i18n.presetCodex)}
                    </DropdownMenuRadioItem>
                    {!isCodexPreset && (
                      <DropdownMenuRadioItem value="custom">
                        {intl.formatMessage(i18n.presetCustom)}
                      </DropdownMenuRadioItem>
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="divide-y divide-border-primary border-t border-border-primary">
            <ThemeRow title={intl.formatMessage(i18n.accent)}>
              <ColorPill
                value={themeColors.accent}
                onChange={(accent) => updateThemeColor({ accent })}
              />
            </ThemeRow>
            <ThemeRow title={intl.formatMessage(i18n.background)}>
              <ColorPill
                value={themeColors.background}
                onChange={(background) => updateThemeColor({ background })}
              />
            </ThemeRow>
            <ThemeRow title={intl.formatMessage(i18n.foreground)}>
              <ColorPill
                value={themeColors.foreground}
                onChange={(foreground) => updateThemeColor({ foreground })}
              />
            </ThemeRow>
            <ThemeRow title={intl.formatMessage(i18n.uiFont)}>
              <FontInput value={settings.uiFont} onChange={(uiFont) => update({ uiFont })} />
            </ThemeRow>
            <ThemeRow title={intl.formatMessage(i18n.codeFont)}>
              <FontInput value={settings.codeFont} onChange={(codeFont) => update({ codeFont })} />
            </ThemeRow>
            <ThemeRow title={intl.formatMessage(i18n.translucentSidebar)}>
              <Toggle
                checked={settings.translucentSidebar}
                onCheckedChange={(translucentSidebar) => update({ translucentSidebar })}
              />
            </ThemeRow>
            <ThemeRow title={intl.formatMessage(i18n.contrast)}>
              <div className="flex w-[280px] items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.contrast}
                  onChange={(e) => update({ contrast: Number(e.target.value) })}
                  className="appearance-range w-full"
                  style={{ '--range-progress': `${settings.contrast}%` } as React.CSSProperties}
                />
                <span className="w-8 text-right text-sm tabular-nums text-text-primary">
                  {settings.contrast}
                </span>
              </div>
            </ThemeRow>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={intl.formatMessage(i18n.preferencesSection)} className="mt-12">
        <SettingsGroup className="bg-background-primary px-5">
          <ThemeRow
            title={intl.formatMessage(i18n.pointerCursors)}
            description={intl.formatMessage(i18n.pointerCursorsDesc)}
          >
            <Toggle
              checked={settings.pointerCursors}
              onCheckedChange={(pointerCursors) => update({ pointerCursors })}
            />
          </ThemeRow>
          <ThemeRow
            title={intl.formatMessage(i18n.reduceMotion)}
            description={intl.formatMessage(i18n.reduceMotionDesc)}
          >
            <Segmented<ReduceMotionSetting>
              value={settings.reduceMotion}
              onChange={(reduceMotion) => update({ reduceMotion })}
              options={[
                { value: 'system', label: intl.formatMessage(i18n.reduceMotionSystem) },
                { value: 'on', label: intl.formatMessage(i18n.reduceMotionOn) },
                { value: 'off', label: intl.formatMessage(i18n.reduceMotionOff) },
              ]}
            />
          </ThemeRow>
          <ThemeRow
            title={intl.formatMessage(i18n.uiFontSize)}
            description={intl.formatMessage(i18n.uiFontSizeDesc)}
          >
            <FontSizeInput
              value={settings.uiFontSize}
              onChange={(uiFontSize) => update({ uiFontSize })}
            />
          </ThemeRow>
          <ThemeRow
            title={intl.formatMessage(i18n.codeFontSize)}
            description={intl.formatMessage(i18n.codeFontSizeDesc)}
          >
            <FontSizeInput
              value={settings.codeFontSize}
              onChange={(codeFontSize) => update({ codeFontSize })}
            />
          </ThemeRow>
          <ThemeRow
            title={intl.formatMessage(i18n.diffMarkers)}
            description={intl.formatMessage(i18n.diffMarkersDesc)}
          >
            <Segmented<DiffMarkersSetting>
              value={settings.diffMarkers}
              onChange={(diffMarkers) => update({ diffMarkers })}
              options={[
                { value: 'color', label: intl.formatMessage(i18n.diffMarkersColor) },
                { value: 'markers', label: intl.formatMessage(i18n.diffMarkersPlain) },
              ]}
            />
          </ThemeRow>
          <ThemeRow
            title={intl.formatMessage(i18n.fontSmoothing)}
            description={intl.formatMessage(i18n.fontSmoothingDesc)}
          >
            <Toggle
              checked={settings.fontSmoothing}
              onCheckedChange={(fontSmoothing) => update({ fontSmoothing })}
            />
          </ThemeRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}

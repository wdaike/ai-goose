/** Keys that only ever qualify another key — pressing one alone records nothing. */
const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift'];

/** Physical keys whose `event.key` is unusable in an Electron accelerator. */
const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space',
  Space: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Enter: 'Return',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

export interface RecordedKey {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Turns a keypress into an Electron accelerator. Layout-independent keys are read off
 * `code` so that a Dvorak or AZERTY user records the key they actually pressed, while
 * everything else falls back to `key`. Returns null for a modifier pressed on its own.
 */
export const acceleratorFromKeyEvent = (event: RecordedKey): string | null => {
  if (MODIFIER_KEYS.includes(event.key)) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  const code = event.code;
  let key = code && code.startsWith('Key') ? code.replace('Key', '') : event.key;

  if (code && code.startsWith('Digit')) {
    key = code.replace('Digit', '');
  } else if (KEY_ALIASES[key] || (code && KEY_ALIASES[code])) {
    key = KEY_ALIASES[key] || KEY_ALIASES[code as string];
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }

  parts.push(key);
  return parts.join('+');
};

/** Renders an accelerator with the symbols the platform's users expect. */
export const formatAccelerator = (accelerator: string, isMac: boolean): string =>
  accelerator
    .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Alt', isMac ? '⌥' : 'Alt')
    .replace('Shift', isMac ? '⇧' : 'Shift');

/** The other binding already using this accelerator, if any. */
export const findConflictingShortcut = <T extends object>(
  shortcuts: T,
  currentKey: string,
  accelerator: string
): Extract<keyof T, string> | null => {
  // An unbound entry can never conflict, whatever the incoming accelerator is
  const conflict = Object.entries(shortcuts).find(
    ([key, shortcut]) => key !== currentKey && Boolean(shortcut) && shortcut === accelerator
  );
  return conflict ? (conflict[0] as Extract<keyof T, string>) : null;
};

import { describe, expect, it } from 'vitest';
import {
  acceleratorFromKeyEvent,
  findConflictingShortcut,
  formatAccelerator,
  type RecordedKey,
} from './keyboardShortcuts';

const press = (overrides: Partial<RecordedKey> & { key: string }): RecordedKey => overrides;

describe('acceleratorFromKeyEvent', () => {
  it.each(['Control', 'Meta', 'Alt', 'Shift'])('records nothing for %s alone', (key) => {
    expect(acceleratorFromKeyEvent(press({ key }))).toBeNull();
  });

  it('uppercases a bare letter', () => {
    expect(acceleratorFromKeyEvent(press({ key: 'a' }))).toBe('A');
  });

  it('reads letters off the physical key so layout does not matter', () => {
    // Dvorak: the KeyS position emits "o"
    expect(acceleratorFromKeyEvent(press({ key: 'o', code: 'KeyS' }))).toBe('S');
  });

  it('reads digits off the physical key', () => {
    expect(acceleratorFromKeyEvent(press({ key: '!', code: 'Digit1', shiftKey: true }))).toBe(
      'Shift+1'
    );
  });

  it('collapses ctrl and meta into one portable modifier', () => {
    expect(acceleratorFromKeyEvent(press({ key: 'k', ctrlKey: true }))).toBe('CommandOrControl+K');
    expect(acceleratorFromKeyEvent(press({ key: 'k', metaKey: true }))).toBe('CommandOrControl+K');
  });

  it('orders modifiers consistently', () => {
    expect(
      acceleratorFromKeyEvent(press({ key: 'p', metaKey: true, altKey: true, shiftKey: true }))
    ).toBe('CommandOrControl+Alt+Shift+P');
  });

  it.each([
    [' ', 'Space'],
    ['ArrowUp', 'Up'],
    ['ArrowDown', 'Down'],
    ['ArrowLeft', 'Left'],
    ['ArrowRight', 'Right'],
    ['Escape', 'Esc'],
    ['Enter', 'Return'],
    ['Tab', 'Tab'],
    ['Backspace', 'Backspace'],
  ])('translates %s to the accelerator name %s', (key, expected) => {
    expect(acceleratorFromKeyEvent(press({ key }))).toBe(expected);
  });

  it('resolves punctuation through the physical key', () => {
    expect(acceleratorFromKeyEvent(press({ key: '?', code: 'Slash', metaKey: true }))).toBe(
      'CommandOrControl+/'
    );
  });

  it('leaves multi-character keys it does not know alone', () => {
    expect(acceleratorFromKeyEvent(press({ key: 'F5' }))).toBe('F5');
  });
});

describe('formatAccelerator', () => {
  it('uses Mac symbols', () => {
    expect(formatAccelerator('CommandOrControl+Shift+P', true)).toBe('⌘+⇧+P');
    expect(formatAccelerator('Alt+F', true)).toBe('⌥+F');
  });

  it('uses spelled-out names elsewhere', () => {
    expect(formatAccelerator('CommandOrControl+Shift+P', false)).toBe('Ctrl+Shift+P');
    expect(formatAccelerator('Alt+F', false)).toBe('Alt+F');
  });

  it('leaves an unmodified key untouched', () => {
    expect(formatAccelerator('F5', true)).toBe('F5');
  });
});

describe('findConflictingShortcut', () => {
  const shortcuts = {
    newChat: 'CommandOrControl+N',
    settings: 'CommandOrControl+,',
    find: null,
  };

  it('names the binding already holding the accelerator', () => {
    expect(findConflictingShortcut(shortcuts, 'settings', 'CommandOrControl+N')).toBe('newChat');
  });

  it('does not report a binding conflicting with itself', () => {
    expect(findConflictingShortcut(shortcuts, 'newChat', 'CommandOrControl+N')).toBeNull();
  });

  it('returns null when the accelerator is free', () => {
    expect(findConflictingShortcut(shortcuts, 'newChat', 'CommandOrControl+J')).toBeNull();
  });

  it('never reports an unbound entry as the conflict', () => {
    expect(findConflictingShortcut(shortcuts, 'newChat', '')).toBeNull();
    expect(findConflictingShortcut(shortcuts, 'newChat', null as unknown as string)).toBeNull();
  });
});

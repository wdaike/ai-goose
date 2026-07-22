export type ConfigReadValue = unknown;

const STORAGE_KEY = 'goose-ui-config';

function readStore(): Record<string, unknown> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, unknown>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function acpReadConfig(
  key: string,
  isSecret: boolean = false
): Promise<ConfigReadValue> {
  const value = readStore()[key];
  if (value == null) {
    return null;
  }
  if (isSecret) {
    return { maskedValue: value as string };
  }
  return value;
}

export async function acpUpsertConfig(
  key: string,
  value: unknown,
  _isSecret: boolean = false
): Promise<void> {
  const store = readStore();
  store[key] = value;
  writeStore(store);
}

export async function acpRemoveConfig(key: string, _isSecret: boolean): Promise<void> {
  const store = readStore();
  delete store[key];
  writeStore(store);
}

export async function acpReadAllConfig(): Promise<Record<string, unknown>> {
  return readStore();
}

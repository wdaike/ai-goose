import type {
  AppConfigAPI,
  CreateChatWindowOptions,
  ElectronAPI,
  FileResponse,
  MessageBoxOptions,
  UpdaterEvent,
} from './preload';
import { codex } from './codex/client';
import { installBrowserCodex } from './codex/browserCodex';
import { defaultSettings, type SettingKey, type Settings } from './utils/settings';

type BrowserEnvironment = {
  VITE_GOOSE_CODEX_BASE?: string;
  VITE_GOOSE_SECRET_KEY?: string;
  VITE_GOOSE_WORKING_DIR?: string;
  VITE_GOOSE_VERSION?: string;
};

type HostListener = (event: unknown, ...args: unknown[]) => void;

const environment = import.meta.env as BrowserEnvironment;
const listeners = new Map<string, Set<HostListener>>();
const settingsPrefix = 'goose:web:setting:';
const recentDirectoriesKey = 'goose:web:recent-directories';

function platform(): string {
  const value = navigator.platform.toLowerCase();
  if (value.includes('mac')) return 'darwin';
  if (value.includes('win')) return 'win32';
  return 'linux';
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function getQueryValue(key: string): string | undefined {
  return new URLSearchParams(window.location.search).get(key) ?? undefined;
}

function getSecretKey(): string | null {
  return getQueryValue('token') ?? environment.VITE_GOOSE_SECRET_KEY ?? null;
}

function getCodexBase(): string {
  return getQueryValue('codexBase') ?? environment.VITE_GOOSE_CODEX_BASE ?? '/codex';
}

const utf8 = { encoder: new TextEncoder(), decoder: new TextDecoder() };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function codexReadFile(filePath: string): Promise<FileResponse> {
  try {
    const { dataBase64 } = await codex.fsReadFile({ path: filePath });
    return {
      file: utf8.decoder.decode(base64ToBytes(dataBase64)),
      filePath,
      error: null,
      found: true,
    };
  } catch (error) {
    return {
      file: '',
      filePath,
      error: error instanceof Error ? error.message : String(error),
      found: false,
    };
  }
}

function emit(channel: string, ...args: unknown[]): void {
  for (const listener of listeners.get(channel) ?? []) {
    listener(undefined, ...args);
  }
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function showMessageBox(options: MessageBoxOptions): { response: number } {
  const message = options.detail ? `${options.message}\n\n${options.detail}` : options.message;
  if (!options.buttons || options.buttons.length < 2) {
    window.alert(message);
    return { response: options.defaultId ?? 0 };
  }

  return { response: window.confirm(message) ? (options.defaultId ?? 0) : 1 };
}

function createChatWindow(options: CreateChatWindowOptions = {}): void {
  const url = new URL(window.location.href);
  if (options.resumeSessionId) {
    url.hash = `/sessions?resumeSessionId=${encodeURIComponent(options.resumeSessionId)}`;
  } else {
    url.hash = '/';
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

const appConfig: Record<string, unknown> = {
  GOOSE_DEFAULT_PROVIDER: 'codex',
  GOOSE_DEFAULT_MODEL: 'current',
  GOOSE_WORKING_DIR: environment.VITE_GOOSE_WORKING_DIR ?? '',
  GOOSE_VERSION: environment.VITE_GOOSE_VERSION ?? 'Web',
  GOOSE_WEB: true,
};

const browserElectron: ElectronAPI = {
  platform: platform(),
  arch: 'web',
  reactReady: () => undefined,
  getConfig: () => ({ ...appConfig }),
  hideWindow: () => undefined,
  directoryChooser: async () => ({ canceled: true, filePaths: [] }),
  createChatWindow,
  logInfo: (text) => console.info(text),
  showNotification: ({ title, body }) => {
    if ('Notification' in window && window.Notification.permission === 'granted') {
      new window.Notification(title, { body });
    }
  },
  showMessageBox: async (options) => showMessageBox(options),
  showSaveDialog: async () => ({ canceled: true }),
  openInChrome: openExternal,
  reloadApp: () => window.location.reload(),
  checkForOllama: async () => false,
  selectFileOrDirectory: async () => null,
  getBinaryPath: async () => '',
  readFile: (filePath) => codexReadFile(filePath),
  writeFile: async (filePath, content) => {
    try {
      await codex.fsWriteFile({
        path: filePath,
        dataBase64: bytesToBase64(utf8.encoder.encode(content)),
      });
      return true;
    } catch {
      return false;
    }
  },
  ensureDirectory: async (dirPath) => {
    try {
      await codex.fsCreateDirectory({ path: dirPath, recursive: true });
      return true;
    } catch {
      return false;
    }
  },
  listFiles: async (dirPath, extension) => {
    try {
      const { entries } = await codex.fsReadDirectory({ path: dirPath });
      const files = entries.filter((entry) => entry.isFile).map((entry) => entry.fileName);
      return extension ? files.filter((name) => name.endsWith(extension)) : files;
    } catch {
      return [];
    }
  },
  listDirectory: async (dirPath) => {
    try {
      const { entries } = await codex.fsReadDirectory({ path: dirPath });
      return entries.map((entry) => ({ name: entry.fileName, isDirectory: entry.isDirectory }));
    } catch {
      return [];
    }
  },
  terminal: {
    create: async () => {
      throw new Error('Terminals are unavailable in the browser');
    },
    write: () => undefined,
    resize: () => undefined,
    kill: () => undefined,
    onData: () => () => undefined,
    onExit: () => () => undefined,
  },
  getAllowedExtensions: async () => ['json', 'jsonl', 'md', 'txt', 'png', 'jpg', 'jpeg', 'webp'],
  getPathForFile: (file) => file.name,
  setMenuBarIcon: async () => false,
  getMenuBarIconState: async () => false,
  setDockIcon: async () => false,
  getDockIconState: async () => false,
  getSetting: async <K extends SettingKey>(key: K): Promise<Settings[K]> =>
    readJson(`${settingsPrefix}${key}`, defaultSettings[key]),
  setSetting: async <K extends SettingKey>(key: K, value: Settings[K]): Promise<void> => {
    writeJson(`${settingsPrefix}${key}`, value);
  },
  setWakelock: async (enable) => {
    await browserElectron.setSetting('enableWakelock', enable);
    return false;
  },
  getWakelockState: async () => browserElectron.getSetting('enableWakelock'),
  setSpellcheck: async (enable) => {
    await browserElectron.setSetting('spellcheckEnabled', enable);
    return true;
  },
  getSpellcheckState: async () => browserElectron.getSetting('spellcheckEnabled'),
  openNotificationsSettings: async () => false,
  isAnyWindowFocused: async () => document.hasFocus(),
  getIsFullScreen: async () => document.fullscreenElement !== null,
  onMouseBackButtonClicked: (callback) => window.addEventListener('popstate', callback),
  offMouseBackButtonClicked: (callback) => window.removeEventListener('popstate', callback),
  on: (channel, callback) => {
    const channelListeners = listeners.get(channel) ?? new Set<HostListener>();
    channelListeners.add(callback as HostListener);
    listeners.set(channel, channelListeners);
  },
  off: (channel, callback) => {
    listeners.get(channel)?.delete(callback as HostListener);
  },
  emit,
  broadcastThemeChange: (themeData) => emit('theme-changed', themeData),
  openExternal: async (url) => openExternal(url),
  getVersion: () => String(appConfig.GOOSE_VERSION),
  checkForUpdates: async () => ({ updateInfo: null, error: 'Updates are managed by the host' }),
  downloadUpdate: async () => ({ success: false, error: 'Updates are managed by the host' }),
  installUpdate: () => undefined,
  restartApp: () => window.location.reload(),
  onUpdaterEvent: (_callback: (event: UpdaterEvent) => void) => undefined,
  getUpdateState: async () => null,
  isUsingGitHubFallback: async () => false,
  getAutoDownloadDisabled: async () => true,
  closeWindow: () => window.close(),
  openDirectoryInExplorer: async () => false,
  addRecentDir: async (directory) => {
    const directories = readJson<string[]>(recentDirectoriesKey, []);
    writeJson(recentDirectoriesKey, [
      directory,
      ...directories.filter((item) => item !== directory),
    ]);
    return true;
  },
  listRecentDirs: async () => readJson<string[]>(recentDirectoriesKey, []),
  listGitWorktreeDirs: async () => [],
  getGitBranch: async () => null,
  getGitRemoteRepo: async () => null,
};

const browserAppConfig: AppConfigAPI = {
  get: (key) => appConfig[key],
  getAll: () => ({ ...appConfig }),
};

export function installBrowserHost(): void {
  if (window.electron) return;
  window.electron = browserElectron;
  window.appConfig = browserAppConfig;
  installBrowserCodex(getCodexBase(), getSecretKey());
}

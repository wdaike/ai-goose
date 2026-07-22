import type {
  DictationDownloadProgress,
  DictationLocalModelStatus,
  DictationProviderStatusEntry,
} from '@aaif/goose-sdk';

export type { DictationProviderStatusEntry };

export type DictationProviders = Record<string, DictationProviderStatusEntry>;
export type LocalDictationModel = DictationLocalModelStatus;
export type LocalDictationDownloadProgress = DictationDownloadProgress;

// Dictation is not wired to codex yet (`thread/realtime/*` is the native path).
export async function getDictationConfig(): Promise<DictationProviders> {
  return {};
}

export async function transcribeDictation(
  _audio: string,
  _mimeType: string,
  _provider: string
): Promise<string> {
  throw new Error('Dictation is not available');
}

export async function listLocalDictationModels(): Promise<LocalDictationModel[]> {
  return [];
}

export async function downloadLocalDictationModel(_modelId: string): Promise<void> {}

export async function getLocalDictationModelDownloadProgress(
  _modelId: string
): Promise<LocalDictationDownloadProgress | null> {
  return null;
}

export async function cancelLocalDictationModelDownload(_modelId: string): Promise<void> {}

export async function deleteLocalDictationModel(_modelId: string): Promise<void> {}

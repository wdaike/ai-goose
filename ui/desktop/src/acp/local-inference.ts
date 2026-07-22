import type {
  LocalInferenceDownloadProgressDto,
  LocalInferenceHfModelInfoDto,
  LocalInferenceHfModelVariantDto,
  LocalInferenceModelDownloadRequest_unstable,
  LocalInferenceModelDto,
  LocalInferenceModelSettingsDto,
} from '@aaif/goose-sdk';

export type LocalModelResponse = LocalInferenceModelDto;
export type DownloadProgress = LocalInferenceDownloadProgressDto;
export type DownloadModelRequest = LocalInferenceModelDownloadRequest_unstable;
export type HfModelInfo = LocalInferenceHfModelInfoDto;
export type HfModelVariant = LocalInferenceHfModelVariantDto;
export type ModelSettings = LocalInferenceModelSettingsDto;
export type SamplingConfig = NonNullable<LocalInferenceModelSettingsDto['sampling']>;
export type ToolCallingMode = NonNullable<LocalInferenceModelSettingsDto['toolCalling']>;
export type ChatTemplate = NonNullable<LocalInferenceModelSettingsDto['chatTemplate']>;

export type RepoVariantsResponse = {
  variants: HfModelVariant[];
  recommendedIndex: number | null;
  availableMemoryBytes: number;
  downloadedQuants: string[];
  downloadedVariants: string[];
};

// Local inference is not part of the codex-backed experimental build.
export async function listLocalModels(): Promise<LocalModelResponse[]> {
  return [];
}

export async function downloadHfModel(_request: DownloadModelRequest): Promise<string> {
  throw new Error('Local inference is not available');
}

export async function getLocalModelDownloadProgress(
  _modelId: string
): Promise<DownloadProgress | null> {
  return null;
}

export async function cancelLocalModelDownload(_modelId: string): Promise<void> {}

export async function deleteLocalModel(_modelId: string): Promise<void> {}

export async function evictLocalModel(_modelId: string): Promise<void> {}

export async function getModelSettings(_modelId: string): Promise<ModelSettings> {
  throw new Error('Local inference is not available');
}

export async function updateModelSettings(
  _modelId: string,
  _settings: ModelSettings
): Promise<void> {}

export async function searchHfModels(_query: string, _limit?: number): Promise<HfModelInfo[]> {
  return [];
}

export async function getRepoFiles(_repoId: string): Promise<RepoVariantsResponse> {
  throw new Error('Local inference is not available');
}

export async function listBuiltinChatTemplates(): Promise<string[]> {
  return [];
}

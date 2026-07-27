import type { Thread } from './protocol/v2/Thread';
import type { ThreadStartParams } from './protocol/v2/ThreadStartParams';
import type { ThreadResumeParams } from './protocol/v2/ThreadResumeParams';
import type { ThreadListParams } from './protocol/v2/ThreadListParams';
import type { ThreadReadParams } from './protocol/v2/ThreadReadParams';
import type { Turn } from './protocol/v2/Turn';
import type { TurnStartParams } from './protocol/v2/TurnStartParams';
import type { TurnInterruptParams } from './protocol/v2/TurnInterruptParams';
import type { TurnSteerParams } from './protocol/v2/TurnSteerParams';
import type { Model } from './protocol/v2/Model';
import type { SkillsListParams } from './protocol/v2/SkillsListParams';
import type { SkillsListResponse } from './protocol/v2/SkillsListResponse';
import type { SkillsConfigWriteParams } from './protocol/v2/SkillsConfigWriteParams';
import type { SkillsConfigWriteResponse } from './protocol/v2/SkillsConfigWriteResponse';
import type { GetAccountResponse } from './protocol/v2/GetAccountResponse';
import type { FsReadFileParams } from './protocol/v2/FsReadFileParams';
import type { FsReadFileResponse } from './protocol/v2/FsReadFileResponse';
import type { FsReadDirectoryParams } from './protocol/v2/FsReadDirectoryParams';
import type { FsReadDirectoryResponse } from './protocol/v2/FsReadDirectoryResponse';
import type { FsWriteFileParams } from './protocol/v2/FsWriteFileParams';
import type { FsWriteFileResponse } from './protocol/v2/FsWriteFileResponse';
import type { FsCreateDirectoryParams } from './protocol/v2/FsCreateDirectoryParams';
import type { FsCreateDirectoryResponse } from './protocol/v2/FsCreateDirectoryResponse';
import type { FsGetMetadataParams } from './protocol/v2/FsGetMetadataParams';
import type { FsGetMetadataResponse } from './protocol/v2/FsGetMetadataResponse';
import type { FsRemoveParams } from './protocol/v2/FsRemoveParams';
import type { FsRemoveResponse } from './protocol/v2/FsRemoveResponse';
import type { ConfigReadParams } from './protocol/v2/ConfigReadParams';
import type { ConfigReadResponse } from './protocol/v2/ConfigReadResponse';
import type { ConfigBatchWriteParams } from './protocol/v2/ConfigBatchWriteParams';
import type { ListMcpServerStatusParams } from './protocol/v2/ListMcpServerStatusParams';
import type { ListMcpServerStatusResponse } from './protocol/v2/ListMcpServerStatusResponse';
import type { PluginListParams } from './protocol/v2/PluginListParams';
import type { PluginListResponse } from './protocol/v2/PluginListResponse';
import type { PluginInstalledParams } from './protocol/v2/PluginInstalledParams';
import type { PluginInstalledResponse } from './protocol/v2/PluginInstalledResponse';
import type { PluginReadParams } from './protocol/v2/PluginReadParams';
import type { PluginReadResponse } from './protocol/v2/PluginReadResponse';
import type { PluginInstallParams } from './protocol/v2/PluginInstallParams';
import type { PluginInstallResponse } from './protocol/v2/PluginInstallResponse';
import type { PluginUninstallParams } from './protocol/v2/PluginUninstallParams';
import type { PluginUninstallResponse } from './protocol/v2/PluginUninstallResponse';
import type { MarketplaceAddParams } from './protocol/v2/MarketplaceAddParams';
import type { MarketplaceAddResponse } from './protocol/v2/MarketplaceAddResponse';
import type { MarketplaceRemoveParams } from './protocol/v2/MarketplaceRemoveParams';
import type { MarketplaceRemoveResponse } from './protocol/v2/MarketplaceRemoveResponse';
import type { AppsListParams } from './protocol/v2/AppsListParams';
import type { AppsListResponse } from './protocol/v2/AppsListResponse';

export interface ThreadResponse {
  thread: Thread;
}

export interface ThreadListResponse {
  data: Thread[];
  nextCursor: string | null;
}

export interface TurnStartResponse {
  turn: Turn;
}

export interface ModelListResponse {
  data: Model[];
}

function request<T>(method: string, params: unknown): Promise<T> {
  return window.codex.request(method, params) as Promise<T>;
}

export const codex = {
  threadStart: (params: ThreadStartParams) => request<ThreadResponse>('thread/start', params),
  threadResume: (params: ThreadResumeParams) => request<ThreadResponse>('thread/resume', params),
  threadRead: (params: ThreadReadParams) => request<ThreadResponse>('thread/read', params),
  threadList: (params: ThreadListParams) => request<ThreadListResponse>('thread/list', params),
  threadSetName: (threadId: string, name: string) =>
    request<Record<string, never>>('thread/name/set', { threadId, name }),
  threadArchive: (threadId: string) =>
    request<Record<string, never>>('thread/archive', { threadId }),
  threadUnarchive: (threadId: string) =>
    request<Record<string, never>>('thread/unarchive', { threadId }),
  threadFork: (threadId: string) => request<ThreadResponse>('thread/fork', { threadId }),
  turnStart: (params: TurnStartParams) => request<TurnStartResponse>('turn/start', params),
  turnSteer: (params: TurnSteerParams) => request<{ turnId: string }>('turn/steer', params),
  turnInterrupt: (params: TurnInterruptParams) =>
    request<Record<string, never>>('turn/interrupt', params),
  modelList: () => request<ModelListResponse>('model/list', {}),
  accountRead: () => request<GetAccountResponse>('account/read', {}),
  skillsList: (params: SkillsListParams) => request<SkillsListResponse>('skills/list', params),
  skillsConfigWrite: (params: SkillsConfigWriteParams) =>
    request<SkillsConfigWriteResponse>('skills/config/write', params),
  fsReadFile: (params: FsReadFileParams) => request<FsReadFileResponse>('fs/readFile', params),
  fsReadDirectory: (params: FsReadDirectoryParams) =>
    request<FsReadDirectoryResponse>('fs/readDirectory', params),
  fsWriteFile: (params: FsWriteFileParams) => request<FsWriteFileResponse>('fs/writeFile', params),
  fsCreateDirectory: (params: FsCreateDirectoryParams) =>
    request<FsCreateDirectoryResponse>('fs/createDirectory', params),
  fsGetMetadata: (params: FsGetMetadataParams) =>
    request<FsGetMetadataResponse>('fs/getMetadata', params),
  fsRemove: (params: FsRemoveParams) => request<FsRemoveResponse>('fs/remove', params),
  configRead: (params: ConfigReadParams = {}) => request<ConfigReadResponse>('config/read', params),
  configBatchWrite: (params: ConfigBatchWriteParams) =>
    request<Record<string, never>>('config/batchWrite', params),
  mcpServerStatusList: (params: ListMcpServerStatusParams = {}) =>
    request<ListMcpServerStatusResponse>('mcpServerStatus/list', params),
  pluginList: (params: PluginListParams = {}) => request<PluginListResponse>('plugin/list', params),
  pluginInstalled: (params: PluginInstalledParams = {}) =>
    request<PluginInstalledResponse>('plugin/installed', params),
  pluginRead: (params: PluginReadParams) => request<PluginReadResponse>('plugin/read', params),
  pluginInstall: (params: PluginInstallParams) =>
    request<PluginInstallResponse>('plugin/install', params),
  pluginUninstall: (params: PluginUninstallParams) =>
    request<PluginUninstallResponse>('plugin/uninstall', params),
  marketplaceAdd: (params: MarketplaceAddParams) =>
    request<MarketplaceAddResponse>('marketplace/add', params),
  marketplaceRemove: (params: MarketplaceRemoveParams) =>
    request<MarketplaceRemoveResponse>('marketplace/remove', params),
  appList: (params: AppsListParams = {}) => request<AppsListResponse>('app/list', params),
  respond: (requestId: number | string, result: unknown) => window.codex.respond(requestId, result),
};

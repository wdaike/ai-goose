import type {
  CanonicalModelInfoDto,
  CustomProviderReadResponse_unstable,
  ProviderSecretDto,
  ProviderTemplateCatalogEntryDto,
  ProviderTemplateDto,
} from '@aaif/goose-sdk';
import type {
  ProviderDetails,
  ThinkingEffort,
  UpdateCustomProviderRequest,
} from '../types/providers';
import { codex } from '../codex/client';
import { setThreadModelOverride } from '../codex/engine/controller';
import type { Model } from '../codex/protocol/v2/Model';
import type { JsonValue } from '../codex/protocol/serde_json/JsonValue';

export type { CanonicalModelInfoDto, ProviderSecretDto };

export const CODEX_PROVIDER_ID = 'codex';

let cachedModels: Model[] | null = null;

async function listCodexModels(): Promise<Model[]> {
  if (!cachedModels) {
    const response = await codex.modelList();
    cachedModels = response.data.filter((model) => !model.hidden);
  }
  return cachedModels;
}

interface CodexModelProvider {
  name?: string;
  base_url?: string;
  env_key?: string;
  wire_api?: string;
  experimental_bearer_token?: string;
}

interface CodexConfigView {
  model: string | null;
  modelProvider: string | null;
  modelProviders: Record<string, CodexModelProvider>;
}

async function readCodexConfig(): Promise<CodexConfigView> {
  const response = await codex.configRead({ includeLayers: true });
  const modelProviders: Record<string, CodexModelProvider> = {};
  for (const layer of response.layers ?? []) {
    const layerConfig = layer.config as { model_providers?: Record<string, CodexModelProvider> } | null;
    Object.assign(modelProviders, layerConfig?.model_providers ?? {});
  }
  return {
    model: response.config.model,
    modelProvider: response.config.model_provider,
    modelProviders,
  };
}

export async function acpListProviderDetails(): Promise<ProviderDetails[]> {
  const [models, config] = await Promise.all([listCodexModels(), readCodexConfig()]);
  const defaultModel = models.find((model) => model.isDefault) ?? models[0];
  const details: ProviderDetails[] = [
    {
      name: CODEX_PROVIDER_ID,
      is_configured: true,
      provider_type: 'Builtin',
      metadata: {
        name: CODEX_PROVIDER_ID,
        display_name: 'Codex',
        description: 'OpenAI Codex',
        default_model: defaultModel?.id ?? '',
        model_doc_link: '',
        model_selection_hint: null,
        config_keys: [],
        known_models: models.map((model) => ({
          name: model.id,
          context_limit: 0,
          reasoning: undefined,
        })),
        setup_steps: [],
      },
    },
  ];
  for (const [providerId, provider] of Object.entries(config.modelProviders)) {
    const knownModels =
      config.modelProvider === providerId && config.model
        ? [{ name: config.model, context_limit: 0, reasoning: undefined }]
        : [];
    details.push({
      name: providerId,
      is_configured: true,
      provider_type: 'Custom',
      metadata: {
        name: providerId,
        display_name: provider.name ?? providerId,
        description: provider.base_url ?? '',
        default_model: knownModels[0]?.name ?? '',
        model_doc_link: '',
        model_selection_hint: null,
        config_keys: [],
        known_models: knownModels,
        setup_steps: [],
      },
    });
  }
  return details;
}

export async function acpListProviderModels(providerId: string) {
  if (providerId !== CODEX_PROVIDER_ID) {
    const config = await readCodexConfig();
    const model = config.modelProvider === providerId ? config.model : null;
    return model
      ? [{ id: model, contextLimit: null as number | null, reasoning: undefined as boolean | undefined }]
      : [];
  }
  const models = await listCodexModels();
  return models.map((model) => ({
    id: model.id,
    contextLimit: null as number | null,
    reasoning: undefined as boolean | undefined,
  }));
}

export async function acpListProviderCatalogEntries(
  _format?: string
): Promise<ProviderTemplateCatalogEntryDto[]> {
  return [];
}

export async function acpGetProviderTemplate(providerId: string): Promise<ProviderTemplateDto> {
  throw new Error(`Provider templates are not available with codex: ${providerId}`);
}

export async function acpGetCustomProvider(
  providerId: string
): Promise<CustomProviderReadResponse_unstable> {
  throw new Error(`Custom providers are not available with codex: ${providerId}`);
}

export async function acpCreateCustomProviderFromRequest(
  request: UpdateCustomProviderRequest
): Promise<{ provider_name: string }> {
  const providerId = request.display_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const provider: CodexModelProvider = {
    name: request.display_name,
    base_url: request.api_url,
    wire_api: 'responses',
    ...(request.api_key ? { experimental_bearer_token: request.api_key } : {}),
  };
  await codex.configBatchWrite({
    edits: [
      { keyPath: `model_providers.${providerId}`, value: provider as JsonValue, mergeStrategy: 'replace' },
    ],
    reloadUserConfig: true,
  });
  return { provider_name: providerId };
}

export async function acpUpdateCustomProviderFromRequest(
  _providerId: string,
  _request: UpdateCustomProviderRequest
): Promise<void> {
  throw new Error('Custom providers are not available with codex');
}

export async function acpDeleteCustomProvider(_providerId: string): Promise<void> {}

export async function acpReadProviderConfig(_providerId: string) {
  return [] as { key: string; value: string; isSet?: boolean }[];
}

export async function acpDeleteProviderConfig(_providerId: string): Promise<void> {}

export async function acpSaveProviderConfig(
  _providerId: string,
  _fields: { key: string; value: string }[]
): Promise<void> {}

export async function acpAuthenticateProvider(_providerId: string): Promise<void> {}

export async function acpListProviderSecrets(): Promise<ProviderSecretDto[]> {
  return [];
}

export async function acpDeleteProviderSecret(_id: string): Promise<void> {}

export async function acpGetCanonicalModelInfo(
  _provider: string,
  _model: string
): Promise<CanonicalModelInfoDto | null> {
  return null;
}

export async function acpReadDefaults(): Promise<{
  providerId: string | null;
  modelId: string | null;
}> {
  const config = await readCodexConfig();
  return { providerId: config.modelProvider ?? CODEX_PROVIDER_ID, modelId: config.model };
}

export async function acpSaveDefaults(providerId: string, modelId?: string | null): Promise<void> {
  await codex.configBatchWrite({
    edits: [
      { keyPath: 'model', value: modelId ?? null, mergeStrategy: 'replace' },
      {
        keyPath: 'model_provider',
        value: providerId === CODEX_PROVIDER_ID ? null : providerId,
        mergeStrategy: 'replace',
      },
    ],
    reloadUserConfig: true,
  });
}

export async function acpClearDefaults(): Promise<void> {
  await acpSaveDefaults(CODEX_PROVIDER_ID, null);
}

const EFFORT_KEY = 'goose-thinking-effort';

export async function acpReadThinkingEffort(): Promise<ThinkingEffort | null> {
  const value = window.localStorage.getItem(EFFORT_KEY);
  return value ? (value as ThinkingEffort) : null;
}

export async function acpSaveThinkingEffort(effort: ThinkingEffort): Promise<void> {
  window.localStorage.setItem(EFFORT_KEY, effort);
  const codexEffort = effort === 'off' ? 'minimal' : effort === 'max' ? 'xhigh' : effort;
  await codex.configBatchWrite({
    edits: [
      { keyPath: 'model_reasoning_effort', value: codexEffort, mergeStrategy: 'replace' },
    ],
    reloadUserConfig: true,
  });
}

export type AppliedSessionProviderModel = {
  providerId?: string;
  modelId?: string;
};

export async function acpSetSessionProviderModel(
  sessionId: string,
  providerId: string,
  modelId?: string | null,
  thinkingEffort?: string | null
): Promise<AppliedSessionProviderModel> {
  // Provider selection is global codex config; `reloadUserConfig` hot-reloads
  // it into loaded threads, so the active session picks it up too.
  await acpSaveDefaults(providerId, modelId ?? null);
  setThreadModelOverride(sessionId, modelId ?? null, thinkingEffort ?? null);
  return { providerId, modelId: modelId ?? undefined };
}

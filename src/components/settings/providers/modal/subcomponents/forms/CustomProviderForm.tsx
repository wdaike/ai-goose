import React, { useState, useEffect } from 'react';
import { Input } from '../../../../../ui/input';
import { Select } from '../../../../../ui/Select';
import { Button } from '../../../../../ui/button';
import { SecureStorageNotice } from '../SecureStorageNotice';
import type { UpdateCustomProviderRequest } from '../../../../../../types/providers';
import { Plus, X, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '../../../../../../utils';
import { defineMessages, useIntl } from '../../../../../../i18n';
import {
  collectHeaders,
  parseModelList,
  validateHeader,
  validateProviderForm,
  type HeaderError,
  type ProviderFieldError,
} from '../../../../../../utils/providerForm';

const i18n = defineMessages({
  cancel: {
    id: 'customProviderForm.cancel',
    defaultMessage: 'Cancel',
  },
  providerType: {
    id: 'customProviderForm.providerType',
    defaultMessage: 'API Type',
  },
  responsesApi: {
    id: 'customProviderForm.responsesApi',
    defaultMessage: 'OpenAI Responses API (/responses)',
  },
  chatApi: {
    id: 'customProviderForm.chatApi',
    defaultMessage: 'OpenAI Chat Completions (/chat/completions)',
  },
  displayName: {
    id: 'customProviderForm.displayName',
    defaultMessage: 'Display Name',
  },
  displayNamePlaceholder: {
    id: 'customProviderForm.displayNamePlaceholder',
    defaultMessage: 'Your Provider Name',
  },
  apiUrl: {
    id: 'customProviderForm.apiUrl',
    defaultMessage: 'API URL',
  },
  apiUrlPlaceholder: {
    id: 'customProviderForm.apiUrlPlaceholder',
    defaultMessage: 'https://api.example.com',
  },
  authentication: {
    id: 'customProviderForm.authentication',
    defaultMessage: 'Authentication',
  },
  authHint: {
    id: 'customProviderForm.authHint',
    defaultMessage: "Local LLMs like Ollama typically don't require an API key.",
  },
  requiresApiKey: {
    id: 'customProviderForm.requiresApiKey',
    defaultMessage: 'This provider requires an API key',
  },
  apiKey: {
    id: 'customProviderForm.apiKey',
    defaultMessage: 'API Key',
  },
  apiKeyPlaceholderExisting: {
    id: 'customProviderForm.apiKeyPlaceholderExisting',
    defaultMessage: 'Leave blank to keep existing key',
  },
  apiKeySaved: {
    id: 'customProviderForm.apiKeySaved',
    defaultMessage: 'Saved key: {preview} — leave blank to keep it',
  },
  apiKeyMissing: {
    id: 'customProviderForm.apiKeyMissing',
    defaultMessage: 'No key is saved for this provider yet',
  },
  apiKeyPlaceholderNew: {
    id: 'customProviderForm.apiKeyPlaceholderNew',
    defaultMessage: 'Your API key',
  },
  availableModels: {
    id: 'customProviderForm.availableModels',
    defaultMessage: 'Available Models (comma-separated)',
  },
  modelsPlaceholder: {
    id: 'customProviderForm.modelsPlaceholder',
    defaultMessage: 'model-a, model-b, model-c',
  },
  customHeaders: {
    id: 'customProviderForm.customHeaders',
    defaultMessage: 'Custom Headers',
  },
  customHeadersHint: {
    id: 'customProviderForm.customHeadersHint',
    defaultMessage:
      'Add custom HTTP headers to include in requests to the provider. Click the "+" button to add after filling both fields.',
  },
  headerNamePlaceholder: {
    id: 'customProviderForm.headerNamePlaceholder',
    defaultMessage: 'Header name',
  },
  valuePlaceholder: {
    id: 'customProviderForm.valuePlaceholder',
    defaultMessage: 'Value',
  },
  add: {
    id: 'customProviderForm.add',
    defaultMessage: 'Add',
  },
  headerBothRequired: {
    id: 'customProviderForm.headerBothRequired',
    defaultMessage: 'Both header name and value must be entered',
  },
  headerNoSpaces: {
    id: 'customProviderForm.headerNoSpaces',
    defaultMessage: 'Header name cannot contain spaces',
  },
  headerDuplicate: {
    id: 'customProviderForm.headerDuplicate',
    defaultMessage: 'A header with this name already exists',
  },
  displayNameRequired: {
    id: 'customProviderForm.displayNameRequired',
    defaultMessage: 'Display name is required',
  },
  apiUrlRequired: {
    id: 'customProviderForm.apiUrlRequired',
    defaultMessage: 'API URL is required',
  },
  apiKeyRequired: {
    id: 'customProviderForm.apiKeyRequired',
    defaultMessage: 'API key is required',
  },
  modelsRequired: {
    id: 'customProviderForm.modelsRequired',
    defaultMessage: 'At least one model is required',
  },
  submitError: {
    id: 'customProviderForm.submitError',
    defaultMessage: 'Failed to save provider. Please check your configuration and try again.',
  },
  cannotDeleteActive: {
    id: 'customProviderForm.cannotDeleteActive',
    defaultMessage:
      "You cannot delete this provider while it's currently in use. Please switch to a different model first.",
  },
  deleteConfirmation: {
    id: 'customProviderForm.deleteConfirmation',
    defaultMessage:
      'Are you sure you want to delete this custom provider? This will permanently remove the provider and its stored API key. This action cannot be undone.',
  },
  confirmDelete: {
    id: 'customProviderForm.confirmDelete',
    defaultMessage: 'Confirm Delete',
  },
  deleteProvider: {
    id: 'customProviderForm.deleteProvider',
    defaultMessage: 'Delete Provider',
  },
  updateProvider: {
    id: 'customProviderForm.updateProvider',
    defaultMessage: 'Update Provider',
  },
  createProvider: {
    id: 'customProviderForm.createProvider',
    defaultMessage: 'Create Provider',
  },
});


const HEADER_ERROR_MESSAGES: Record<HeaderError, (typeof i18n)[keyof typeof i18n]> = {
  bothRequired: i18n.headerBothRequired,
  noSpaces: i18n.headerNoSpaces,
  duplicate: i18n.headerDuplicate,
};

const FIELD_ERROR_MESSAGES: Record<ProviderFieldError, (typeof i18n)[keyof typeof i18n]> = {
  displayNameRequired: i18n.displayNameRequired,
  apiUrlRequired: i18n.apiUrlRequired,
  apiKeyRequired: i18n.apiKeyRequired,
  modelsRequired: i18n.modelsRequired,
};

interface CustomProviderFormProps {
  onSubmit: (data: UpdateCustomProviderRequest) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  isActiveProvider?: boolean;
  initialData: UpdateCustomProviderRequest | null;
  apiKeyPreview?: string | null;
  isEditable?: boolean;
}

export default function CustomProviderForm({
  onSubmit,
  onCancel,
  onDelete,
  isActiveProvider = false,
  initialData,
  apiKeyPreview,
  isEditable,
}: CustomProviderFormProps) {
  const intl = useIntl();
  const [engine, setEngine] = useState('responses');
  const [displayName, setDisplayName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState('');
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');
  const [headerValidationError, setHeaderValidationError] = useState<string | null>(null);
  const [invalidHeaderFields, setInvalidHeaderFields] = useState<{ key: boolean; value: boolean }>({
    key: false,
    value: false,
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);


  useEffect(() => {
    if (initialData) {
      setEngine(initialData.engine === 'chat' ? 'chat' : 'responses');
      setDisplayName(initialData.display_name);
      setApiUrl(initialData.api_url);
      setModels(initialData.models.join(', '));
      setRequiresAuth(initialData.requires_auth ?? true);

      if (initialData.headers) {
        const headerList = Object.entries(initialData.headers).map(([key, value]) => ({
          key,
          value,
        }));
        setHeaders(headerList);
      }

    }
  }, [initialData]);

  const handleRequiresAuthChange = (checked: boolean) => {
    setRequiresAuth(checked);
    if (!checked) {
      setApiKey('');
    }
  };

  const handleAddHeader = () => {
    const headerError = validateHeader(newHeaderKey, newHeaderValue, headers);
    if (headerError) {
      setInvalidHeaderFields(
        headerError === 'bothRequired'
          ? { key: !newHeaderKey.trim(), value: !newHeaderValue.trim() }
          : { key: true, value: false }
      );
      setHeaderValidationError(intl.formatMessage(HEADER_ERROR_MESSAGES[headerError]));
      return;
    }

    setHeaderValidationError(null);
    setInvalidHeaderFields({ key: false, value: false });
    setHeaders([...headers, { key: newHeaderKey, value: newHeaderValue }]);
    setNewHeaderKey('');
    setNewHeaderValue('');
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handleHeaderChange = (index: number, field: 'key' | 'value', value: string) => {
    if (field === 'key') {
      if (value.includes(' ')) return;
      const normalizedValue = value.trim().toLowerCase();
      const isDuplicate = headers.some(
        (h, i) => i !== index && h.key.trim().toLowerCase() === normalizedValue
      );
      if (isDuplicate && normalizedValue !== '') return;
      const updatedHeaders = [...headers];
      updatedHeaders[index].key = value;
      setHeaders(updatedHeaders);
      return;
    }
    const updatedHeaders = [...headers];
    updatedHeaders[index][field] = value;
    setHeaders(updatedHeaders);
  };

  const clearHeaderValidation = () => {
    setHeaderValidationError(null);
    setInvalidHeaderFields({ key: false, value: false });
  };

  const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddHeader();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setValidationErrors({});

    const fieldErrors = validateProviderForm({
      displayName,
      apiUrl,
      requiresAuth,
      apiKey,
      models,
      hasStoredKey: Boolean(initialData && (initialData.requires_auth ?? true)),
    });

    if (Object.keys(fieldErrors).length > 0) {
      setValidationErrors(
        Object.fromEntries(
          Object.entries(fieldErrors).map(([field, code]) => [
            field,
            intl.formatMessage(FIELD_ERROR_MESSAGES[code!]),
          ])
        )
      );
      return;
    }

    const modelList = parseModelList(models);
    const headersObject = collectHeaders(headers, {
      key: newHeaderKey,
      value: newHeaderValue,
    });

    try {
      await onSubmit({
        engine,
        display_name: displayName,
        api_url: apiUrl,
        api_key: apiKey,
        models: modelList,
        requires_auth: requiresAuth,
        headers: headersObject,
        catalog_provider_id:
          initialData?.catalog_provider_id ?? undefined,
      });
    } catch (error) {
      console.error('Failed to save custom provider:', error);
      setSubmitError(intl.formatMessage(i18n.submitError));
    }
  };


  // -- Step: Form --
  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      {/* Provider type dropdown */}
      {isEditable && (
        <div>
          <label
            htmlFor="provider-select"
            className="flex items-center text-sm font-medium text-text-primary mb-2"
          >
            {intl.formatMessage(i18n.providerType)}
            <span className="text-red-500 ml-1">*</span>
          </label>
          <Select
            id="provider-select"
            aria-invalid={!!validationErrors.providerType}
            aria-describedby={validationErrors.providerType ? 'provider-select-error' : undefined}
            options={[
              { value: 'responses', label: intl.formatMessage(i18n.responsesApi) },
              { value: 'chat', label: intl.formatMessage(i18n.chatApi) },
            ]}
            value={{
              value: engine,
              label:
                engine === 'chat'
                  ? intl.formatMessage(i18n.chatApi)
                  : intl.formatMessage(i18n.responsesApi),
            }}
            onChange={(option: unknown) => {
              const selectedOption = option as { value: string; label: string } | null;
              if (selectedOption) setEngine(selectedOption.value);
            }}
            isSearchable={false}
          />
          {validationErrors.providerType && (
            <p id="provider-select-error" className="text-red-500 text-sm mt-1">
              {validationErrors.providerType}
            </p>
          )}
        </div>
      )}

      {/* Display name */}
      {isEditable && (
        <div>
          <label
            htmlFor="display-name"
            className="flex items-center text-sm font-medium text-text-primary mb-2"
          >
            {intl.formatMessage(i18n.displayName)}
            <span className="text-red-500 ml-1">*</span>
          </label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={intl.formatMessage(i18n.displayNamePlaceholder)}
            aria-invalid={!!validationErrors.displayName}
            aria-describedby={validationErrors.displayName ? 'display-name-error' : undefined}
            className={validationErrors.displayName ? 'border-red-500' : ''}
          />
          {validationErrors.displayName && (
            <p id="display-name-error" className="text-red-500 text-sm mt-1">
              {validationErrors.displayName}
            </p>
          )}
        </div>
      )}

      {/* API URL */}
      {isEditable && (
        <div>
          <label
            htmlFor="api-url"
            className="flex items-center text-sm font-medium text-text-primary mb-2"
          >
            {intl.formatMessage(i18n.apiUrl)}
            <span className="text-red-500 ml-1">*</span>
          </label>
          <Input
            id="api-url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder={intl.formatMessage(i18n.apiUrlPlaceholder)}
            aria-invalid={!!validationErrors.apiUrl}
            aria-describedby={validationErrors.apiUrl ? 'api-url-error' : undefined}
            className={validationErrors.apiUrl ? 'border-red-500' : ''}
          />
          {validationErrors.apiUrl && (
            <p id="api-url-error" className="text-red-500 text-sm mt-1">
              {validationErrors.apiUrl}
            </p>
          )}
        </div>
      )}

      {/* Authentication */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          {intl.formatMessage(i18n.authentication)}
        </label>
        <p className="text-sm text-text-secondary mb-3">{intl.formatMessage(i18n.authHint)}</p>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="requires-auth"
            checked={requiresAuth}
            onChange={(e) => handleRequiresAuthChange(e.target.checked)}
            className="rounded border-border-primary"
          />
          <label htmlFor="requires-auth" className="text-sm text-text-secondary">
            {intl.formatMessage(i18n.requiresApiKey)}
          </label>
        </div>

        {requiresAuth && (
          <div className="mt-3">
            <label
              htmlFor="api-key"
              className="flex items-center text-sm font-medium text-text-primary mb-2"
            >
              {intl.formatMessage(i18n.apiKey)}
              {!initialData && <span className="text-red-500 ml-1">*</span>}
            </label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                initialData
                  ? intl.formatMessage(i18n.apiKeyPlaceholderExisting)
                  : intl.formatMessage(i18n.apiKeyPlaceholderNew)
              }
              aria-invalid={!!validationErrors.apiKey}
              aria-describedby={validationErrors.apiKey ? 'api-key-error' : undefined}
              className={validationErrors.apiKey ? 'border-red-500' : ''}
            />
            {initialData && (
              <p className="text-xs text-textSubtle mt-1">
                {apiKeyPreview
                  ? intl.formatMessage(i18n.apiKeySaved, { preview: apiKeyPreview })
                  : intl.formatMessage(i18n.apiKeyMissing)}
              </p>
            )}
            {validationErrors.apiKey && (
              <p id="api-key-error" className="text-red-500 text-sm mt-1">
                {validationErrors.apiKey}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Models */}
      {isEditable && (
        <div>
          <label
            htmlFor="available-models"
            className="flex items-center text-sm font-medium text-text-primary mb-2"
          >
            {intl.formatMessage(i18n.availableModels)}
            <span className="text-red-500 ml-1">*</span>
          </label>
          <Input
            id="available-models"
            value={models}
            onChange={(e) => setModels(e.target.value)}
            placeholder={intl.formatMessage(i18n.modelsPlaceholder)}
            aria-invalid={!!validationErrors.models}
            aria-describedby={validationErrors.models ? 'available-models-error' : undefined}
            className={validationErrors.models ? 'border-red-500' : ''}
          />
          {validationErrors.models && (
            <p id="available-models-error" className="text-red-500 text-sm mt-1">
              {validationErrors.models}
            </p>
          )}
        </div>
      )}

      {/* Custom headers */}
      {isEditable && (
        <div>
          <label className="text-sm font-medium text-textStandard mb-2 block">
            {intl.formatMessage(i18n.customHeaders)}
          </label>
          <p className="text-xs text-textSubtle mb-4">
            {intl.formatMessage(i18n.customHeadersHint)}
          </p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            {headers.map((header, index) => (
              <React.Fragment key={index}>
                <Input
                  value={header.key}
                  onChange={(e) => handleHeaderChange(index, 'key', e.target.value)}
                  placeholder={intl.formatMessage(i18n.headerNamePlaceholder)}
                  className="w-full text-textStandard border-borderSubtle hover:border-borderStandard"
                />
                <Input
                  value={header.value}
                  onChange={(e) => handleHeaderChange(index, 'value', e.target.value)}
                  placeholder={intl.formatMessage(i18n.valuePlaceholder)}
                  className="w-full text-textStandard border-borderSubtle hover:border-borderStandard"
                />
                <Button
                  onClick={() => handleRemoveHeader(index)}
                  variant="ghost"
                  type="button"
                  className="group p-2 h-auto text-iconSubtle hover:bg-transparent"
                >
                  <X className="h-3 w-3 text-gray-400 group-hover:text-white group-hover:drop-shadow-sm transition-all" />
                </Button>
              </React.Fragment>
            ))}

            <Input
              value={newHeaderKey}
              onChange={(e) => {
                setNewHeaderKey(e.target.value);
                clearHeaderValidation();
              }}
              onKeyDown={handleHeaderKeyDown}
              placeholder="Header name"
              className={cn(
                'w-full text-textStandard border-borderSubtle hover:border-borderStandard',
                invalidHeaderFields.key && 'border-red-500 focus:border-red-500'
              )}
            />
            <Input
              value={newHeaderValue}
              onChange={(e) => {
                setNewHeaderValue(e.target.value);
                clearHeaderValidation();
              }}
              onKeyDown={handleHeaderKeyDown}
              placeholder={intl.formatMessage(i18n.valuePlaceholder)}
              className={cn(
                'w-full text-textStandard border-borderSubtle hover:border-borderStandard',
                invalidHeaderFields.value && 'border-red-500 focus:border-red-500'
              )}
            />
            <Button
              onClick={handleAddHeader}
              variant="ghost"
              type="button"
              className="flex items-center justify-start gap-1 px-2 pr-4 text-sm rounded-full text-textStandard bg-background-primary border border-borderSubtle hover:border-borderStandard transition-colors min-w-[60px] h-9 [&>svg]:!size-4"
            >
              <Plus /> {intl.formatMessage(i18n.add)}
            </Button>
          </div>
          {headerValidationError && (
            <div className="mt-2 text-red-500 text-sm">{headerValidationError}</div>
          )}
        </div>
      )}

      <SecureStorageNotice />

      {submitError && <p className="text-red-500 text-sm">{submitError}</p>}

      {showDeleteConfirmation ? (
        <div className="pt-4 space-y-3">
          {isActiveProvider ? (
            <div className="px-4 py-3 bg-yellow-600/20 border border-yellow-500/30 rounded">
              <p className="text-yellow-500 text-sm flex items-start">
                <AlertTriangle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                <span>{intl.formatMessage(i18n.cannotDeleteActive)}</span>
              </p>
            </div>
          ) : (
            <div className="px-4 py-3 bg-red-900/20 border border-red-500/30 rounded">
              <p className="text-red-400 text-sm">{intl.formatMessage(i18n.deleteConfirmation)}</p>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteConfirmation(false)}
            >
              {intl.formatMessage(i18n.cancel)}
            </Button>
            {!isActiveProvider && (
              <Button type="button" variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                {intl.formatMessage(i18n.confirmDelete)}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex justify-end space-x-2 pt-4">
          {initialData && onDelete && (
            <Button
              type="button"
              variant="outline"
              className="text-red-500 hover:text-red-600 mr-auto"
              onClick={() => setShowDeleteConfirmation(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {intl.formatMessage(i18n.deleteProvider)}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onCancel}>
            {intl.formatMessage(i18n.cancel)}
          </Button>
          <Button type="submit">
            {initialData
              ? intl.formatMessage(i18n.updateProvider)
              : intl.formatMessage(i18n.createProvider)}
          </Button>
        </div>
      )}
    </form>
  );
}

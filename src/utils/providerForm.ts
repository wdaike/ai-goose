export interface ProviderHeader {
  key: string;
  value: string;
}

export type HeaderError = 'bothRequired' | 'noSpaces' | 'duplicate';

export type ProviderFieldError = 'displayNameRequired' | 'apiUrlRequired' | 'apiKeyRequired' | 'modelsRequired';

export interface ProviderFormValues {
  displayName: string;
  apiUrl: string;
  requiresAuth: boolean;
  apiKey: string;
  models: string;
  /** Whether the provider being edited already has a key stored server-side. */
  hasStoredKey: boolean;
}

const normalizeKey = (key: string) => key.trim().toLowerCase();

/**
 * Header names go on the wire verbatim, so a space makes the request malformed and a
 * repeat silently overwrites the earlier value — both are rejected before they land.
 */
export const validateHeader = (
  key: string,
  value: string,
  existing: ProviderHeader[]
): HeaderError | null => {
  if (!key.trim() || !value.trim()) return 'bothRequired';
  if (key.includes(' ')) return 'noSpaces';
  if (existing.some((header) => normalizeKey(header.key) === normalizeKey(key))) return 'duplicate';
  return null;
};

/** Field-level errors keyed by form field; an empty object means the form may submit. */
export const validateProviderForm = ({
  displayName,
  apiUrl,
  requiresAuth,
  apiKey,
  models,
  hasStoredKey,
}: ProviderFormValues): Partial<Record<string, ProviderFieldError>> => {
  const errors: Partial<Record<string, ProviderFieldError>> = {};
  if (!displayName) errors.displayName = 'displayNameRequired';
  if (!apiUrl) errors.apiUrl = 'apiUrlRequired';
  if (requiresAuth && !apiKey && !hasStoredKey) errors.apiKey = 'apiKeyRequired';
  if (!models) errors.models = 'modelsRequired';
  return errors;
};

export const parseModelList = (models: string): string[] =>
  models
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

/**
 * Folds the header rows into the wire format, dropping blanks. A pending row the user
 * typed but never committed is included too, so long as it would have been valid.
 */
export const collectHeaders = (
  headers: ProviderHeader[],
  pending?: ProviderHeader
): Record<string, string> => {
  const all = [...headers];
  if (pending && validateHeader(pending.key, pending.value, headers) === null) {
    all.push(pending);
  }

  return all.reduce<Record<string, string>>((acc, header) => {
    if (header.key.trim() && header.value.trim()) {
      acc[header.key.trim()] = header.value.trim();
    }
    return acc;
  }, {});
};

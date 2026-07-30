import { describe, expect, it } from 'vitest';
import {
  collectHeaders,
  parseModelList,
  validateHeader,
  validateProviderForm,
  type ProviderFormValues,
} from './providerForm';

const header = (key: string, value = 'v') => ({ key, value });

const form = (overrides: Partial<ProviderFormValues> = {}): ProviderFormValues => ({
  displayName: 'My Provider',
  apiUrl: 'https://api.example.com',
  requiresAuth: true,
  apiKey: 'sk-test',
  models: 'model-a',
  hasStoredKey: false,
  ...overrides,
});

describe('validateHeader', () => {
  it('accepts a well-formed header', () => {
    expect(validateHeader('X-Trace', 'abc', [])).toBeNull();
  });

  it('rejects a blank name or value', () => {
    expect(validateHeader('', 'abc', [])).toBe('bothRequired');
    expect(validateHeader('X-Trace', '', [])).toBe('bothRequired');
    expect(validateHeader('   ', '   ', [])).toBe('bothRequired');
  });

  it('rejects a name containing a space', () => {
    expect(validateHeader('X Trace', 'abc', [])).toBe('noSpaces');
  });

  it('rejects a duplicate regardless of case', () => {
    expect(validateHeader('x-trace', 'abc', [header('X-Trace')])).toBe('duplicate');
  });

  it('matches duplicates against padded existing names', () => {
    expect(validateHeader('X-Trace', 'abc', [header('  X-Trace  ')])).toBe('duplicate');
  });

  it('reports padding on the new name as a space, before checking duplication', () => {
    expect(validateHeader('  X-Trace  ', 'abc', [header('X-Trace')])).toBe('noSpaces');
  });

  it('checks emptiness before duplication', () => {
    expect(validateHeader('X-Trace', '', [header('X-Trace')])).toBe('bothRequired');
  });
});

describe('validateProviderForm', () => {
  it('passes a complete form', () => {
    expect(validateProviderForm(form())).toEqual({});
  });

  it('requires a display name and an API url', () => {
    expect(validateProviderForm(form({ displayName: '', apiUrl: '' }))).toEqual({
      displayName: 'displayNameRequired',
      apiUrl: 'apiUrlRequired',
    });
  });

  it('requires at least one model', () => {
    expect(validateProviderForm(form({ models: '' })).models).toBe('modelsRequired');
  });

  it('requires a key when the provider authenticates and none is stored', () => {
    expect(validateProviderForm(form({ apiKey: '' })).apiKey).toBe('apiKeyRequired');
  });

  it('accepts a blank key when one is already stored', () => {
    expect(validateProviderForm(form({ apiKey: '', hasStoredKey: true }))).toEqual({});
  });

  it('accepts a blank key when the provider needs no auth', () => {
    expect(validateProviderForm(form({ apiKey: '', requiresAuth: false }))).toEqual({});
  });
});

describe('parseModelList', () => {
  it('splits, trims and drops blanks', () => {
    expect(parseModelList(' a , b ,, c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for an empty string', () => {
    expect(parseModelList('')).toEqual([]);
    expect(parseModelList('  ,  ')).toEqual([]);
  });
});

describe('collectHeaders', () => {
  it('folds rows into an object, trimming both sides', () => {
    expect(collectHeaders([{ key: ' A ', value: ' 1 ' }])).toEqual({ A: '1' });
  });

  it('drops rows missing a name or value', () => {
    expect(collectHeaders([header('A'), { key: '', value: 'x' }, { key: 'B', value: '' }])).toEqual({
      A: 'v',
    });
  });

  it('includes a valid pending row the user never committed', () => {
    expect(collectHeaders([header('A')], header('B', '2'))).toEqual({ A: 'v', B: '2' });
  });

  it('ignores a pending row that would be rejected', () => {
    expect(collectHeaders([header('A')], header('B C', '2'))).toEqual({ A: 'v' });
    expect(collectHeaders([header('A')], header('a', '2'))).toEqual({ A: 'v' });
    expect(collectHeaders([header('A')], header('', ''))).toEqual({ A: 'v' });
  });

  it('returns an empty object for no headers at all', () => {
    expect(collectHeaders([])).toEqual({});
  });
});

import { useEffect, useState } from 'react';
import { codex } from '../../codex/client';

const MIME_BY_EXTENSION: Record<string, string> = {
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  png: 'image/png',
};

function mimeType(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? 'image/png';
}

const cache = new Map<string, Promise<string>>();

/**
 * Plugin logos live on disk and the renderer's CSP has no `file:` source, so
 * assets are read through codex and inlined as data URIs (which the CSP allows).
 */
function readLocalImage(path: string): Promise<string> {
  const cached = cache.get(path);
  if (cached) return cached;

  const promise = codex
    .fsReadFile({ path })
    .then(({ dataBase64 }) => `data:${mimeType(path)};base64,${dataBase64}`);
  promise.catch(() => cache.delete(path));
  cache.set(path, promise);
  return promise;
}

export function useLocalImage(path: string | null): string | null {
  const [dataUri, setDataUri] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setDataUri(null);
      return;
    }
    let cancelled = false;
    readLocalImage(path)
      .then((uri) => {
        if (!cancelled) setDataUri(uri);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  return dataUri;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { compressImageDataUrl } from '../utils/conversionUtils';
import type { ImageData } from '../types/message';

export const MAX_IMAGES_PER_MESSAGE = 10;

export interface PastedImage {
  id: string;
  dataUrl: string;
  isLoading: boolean;
  error?: string;
}

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

function newImageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Owns the images a user attaches to a message via paste or the file picker,
 * including their async read/compress lifecycle. Callers add files and read
 * back the derived state; the hook cleans up its own error-message timers.
 */
export function usePastedImages(readErrorMessage: string) {
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const errorTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = errorTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const readImageFile = useCallback(
    (file: File, idPrefix: string) => {
      const id = newImageId(idPrefix);
      setPastedImages((prev) => [...prev, { id, dataUrl: '', isLoading: true }]);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) return;
        const compressedDataUrl = await compressImageDataUrl(dataUrl);
        setPastedImages((prev) =>
          prev.map((img) =>
            img.id === id ? { ...img, dataUrl: compressedDataUrl, isLoading: false, error: undefined } : img
          )
        );
      };
      reader.onerror = () => {
        setPastedImages((prev) =>
          prev.map((img) =>
            img.id === id ? { ...img, isLoading: false, error: readErrorMessage } : img
          )
        );
      };
      reader.readAsDataURL(file);
    },
    [readErrorMessage]
  );

  const showLimitError = useCallback((attempted: number, current: number) => {
    setPastedImages((prev) => [
      ...prev,
      {
        id: `error-${Date.now()}`,
        dataUrl: '',
        isLoading: false,
        error: `Cannot paste ${attempted} image(s). Maximum ${MAX_IMAGES_PER_MESSAGE} images per message allowed. Currently have ${current}.`,
      },
    ]);
    const timer = setTimeout(() => {
      setPastedImages((prev) => prev.filter((img) => !img.id.startsWith('error-')));
      errorTimers.current.delete(timer);
    }, 5000);
    errorTimers.current.add(timer);
  }, []);

  /** Add pasted image files; shows an inline limit error instead of adding when over the cap. */
  const addPastedFiles = useCallback(
    (files: File[]) => {
      if (pastedImages.length + files.length > MAX_IMAGES_PER_MESSAGE) {
        showLimitError(files.length, pastedImages.length);
        return;
      }
      files.forEach((file) => readImageFile(file, 'img'));
    },
    [pastedImages.length, readImageFile, showLimitError]
  );

  /** Add a single picked image; returns false (a no-op) once the cap is reached. */
  const addPickedFile = useCallback(
    (file: File): boolean => {
      if (pastedImages.length >= MAX_IMAGES_PER_MESSAGE) return false;
      readImageFile(file, 'upload');
      return true;
    },
    [pastedImages.length, readImageFile]
  );

  const removeImage = useCallback((id: string) => {
    setPastedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => setPastedImages([]), []);

  const toImageData = useCallback(
    (): ImageData[] =>
      pastedImages
        .filter((img) => img.dataUrl && !img.error && !img.isLoading)
        .map((img) => {
          const matches = img.dataUrl.match(DATA_URL_PATTERN);
          return matches ? { data: matches[2], mimeType: matches[1] } : null;
        })
        .filter((img): img is ImageData => img !== null),
    [pastedImages]
  );

  const hasReadyImage = pastedImages.some((img) => img.dataUrl && !img.error && !img.isLoading);
  const isAnyImageLoading = pastedImages.some((img) => img.isLoading);

  return {
    pastedImages,
    addPastedFiles,
    addPickedFile,
    removeImage,
    clearImages,
    toImageData,
    hasReadyImage,
    isAnyImageLoading,
  };
}

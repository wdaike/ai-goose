import type React from 'react';
import { getItemIcon } from './ItemIcon';
import { Close } from './icons';
import { defineMessages, useIntl } from '../i18n';
import type { DroppedFile } from '../hooks/useFileDrop';
import type { PastedImage } from '../hooks/usePastedImages';

const i18n = defineMessages({
  removeImage: {
    id: 'composerAttachments.removeImage',
    defaultMessage: 'Remove image',
  },
  removeFile: {
    id: 'composerAttachments.removeFile',
    defaultMessage: 'Remove file',
  },
  file: {
    id: 'composerAttachments.file',
    defaultMessage: 'File',
  },
});

function fileKind(name: string): string {
  const ext = name.split('.').pop();
  return ext && ext !== name ? ext.toUpperCase() : '';
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background-inverse text-text-inverse opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none"
    >
      <Close className="h-3 w-3" />
    </button>
  );
}

function Spinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
    </div>
  );
}

interface ComposerAttachmentsProps {
  images: PastedImage[];
  files: DroppedFile[];
  onRemoveImage: (id: string) => void;
  onRemoveFile: (id: string) => void;
}

export function ComposerAttachments({
  images,
  files,
  onRemoveImage,
  onRemoveFile,
}: ComposerAttachmentsProps) {
  const intl = useIntl();

  if (images.length === 0 && files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
      {images.map((image) => (
        <div key={image.id} className="group relative h-14 w-14">
          {image.dataUrl && (
            <img
              src={image.dataUrl}
              alt=""
              className={`h-full w-full rounded-xl object-cover ${
                image.error ? 'ring-1 ring-border-danger' : 'ring-1 ring-border-primary'
              }`}
            />
          )}
          {image.isLoading && <Spinner />}
          {image.error && !image.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70 p-1 text-center text-[10px] leading-tight text-red-300">
              {image.error.substring(0, 40)}
            </div>
          )}
          {!image.isLoading && (
            <RemoveButton
              onClick={() => onRemoveImage(image.id)}
              label={intl.formatMessage(i18n.removeImage)}
            />
          )}
        </div>
      ))}

      {files.map((file) =>
        file.isImage ? (
          <div key={file.id} className="group relative h-14 w-14">
            {file.dataUrl && (
              <img
                src={file.dataUrl}
                alt={file.name}
                className={`h-full w-full rounded-xl object-cover ${
                  file.error ? 'ring-1 ring-border-danger' : 'ring-1 ring-border-primary'
                }`}
              />
            )}
            {file.isLoading && <Spinner />}
            {file.error && !file.isLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70 p-1 text-center text-[10px] leading-tight text-red-300">
                {file.error.substring(0, 40)}
              </div>
            )}
            {!file.isLoading && (
              <RemoveButton
                onClick={() => onRemoveFile(file.id)}
                label={intl.formatMessage(i18n.removeFile)}
              />
            )}
          </div>
        ) : (
          <FileChip
            key={file.id}
            name={file.name}
            detail={file.error ?? fileKindLabel(file.name, intl.formatMessage(i18n.file))}
          >
            <RemoveButton
              onClick={() => onRemoveFile(file.id)}
              label={intl.formatMessage(i18n.removeFile)}
            />
          </FileChip>
        )
      )}
    </div>
  );
}

export function FileChip({
  name,
  detail,
  children,
}: {
  name: string;
  detail: string;
  children?: React.ReactNode;
}) {
  const { Icon, color } = getItemIcon({
    name,
    extra: '',
    itemType: 'File',
    relativePath: name,
  });

  return (
    <div className="group relative flex max-w-[220px] items-center gap-2.5 rounded-2xl border border-border-primary bg-background-primary py-2 pl-2 pr-3">
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: color }}
      >
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-primary" title={name}>
          {name}
        </p>
        <p className="truncate text-xs text-text-secondary">{detail}</p>
      </div>
      {children}
    </div>
  );
}

export function fileKindLabel(name: string, fallback: string): string {
  return fileKind(name) || fallback;
}

import { useState } from 'react';
import { Download, Minus, Plus } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../ui/dialog';

const i18n = defineMessages({
  unableToLoad: {
    id: 'imagePreview.unableToLoad',
    defaultMessage: 'Unable to load image',
  },
  altText: {
    id: 'imagePreview.altText',
    defaultMessage: 'iCodex image',
  },
  clickToExpand: {
    id: 'imagePreview.clickToExpand',
    defaultMessage: 'Click to expand',
  },
  previewTitle: {
    id: 'imagePreview.previewTitle',
    defaultMessage: 'Image preview',
  },
  download: {
    id: 'imagePreview.download',
    defaultMessage: 'Download image',
  },
  zoomOut: {
    id: 'imagePreview.zoomOut',
    defaultMessage: 'Zoom out',
  },
  zoomIn: {
    id: 'imagePreview.zoomIn',
    defaultMessage: 'Zoom in',
  },
  resetZoom: {
    id: 'imagePreview.resetZoom',
    defaultMessage: 'Reset zoom to 100%',
  },
});

interface ImagePreviewProps {
  src: string;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

function imageFilename(src: string): string {
  const subtype = src.match(/^data:image\/([^;,]+)/)?.[1]?.replace('+xml', '');
  return `icodex-image.${subtype === 'jpeg' ? 'jpg' : subtype || 'png'}`;
}

export default function ImagePreview({ src }: ImagePreviewProps) {
  const intl = useIntl();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [error, setError] = useState(false);

  const updatePreviewOpen = (open: boolean) => {
    setPreviewOpen(open);
    if (open) setPreviewScale(1);
  };

  if (error) {
    return (
      <div className="text-red-500 text-xs italic mt-1 mb-1">
        {intl.formatMessage(i18n.unableToLoad)}
      </div>
    );
  }

  return (
    <Dialog open={previewOpen} onOpenChange={updatePreviewOpen}>
      <div className="image-preview mt-2 mb-2">
        <DialogTrigger asChild>
          <button
            type="button"
            className="block cursor-zoom-in rounded outline-none focus-visible:ring-2 focus-visible:ring-border-active"
            aria-label={intl.formatMessage(i18n.clickToExpand)}
          >
            <img
              src={src}
              alt={intl.formatMessage(i18n.altText)}
              onError={() => setError(true)}
              className="max-h-40 max-w-40 rounded border border-border-primary object-contain transition-colors hover:border-border-secondary"
            />
          </button>
        </DialogTrigger>
        <div className="text-xs text-text-secondary mt-1">
          {intl.formatMessage(i18n.clickToExpand)}
        </div>
      </div>

      <DialogContent
        overlayClassName="bg-black/85"
        className="h-screen w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-none [&_[data-slot=dialog-close]]:right-5 [&_[data-slot=dialog-close]]:top-5 [&_[data-slot=dialog-close]]:z-20 [&_[data-slot=dialog-close]]:size-12 [&_[data-slot=dialog-close]]:bg-background-primary [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]_svg]:size-6"
        onClick={(event) => {
          if (event.target === event.currentTarget) updatePreviewOpen(false);
        }}
      >
        <DialogTitle className="sr-only">{intl.formatMessage(i18n.previewTitle)}</DialogTitle>

        <a
          href={src}
          download={imageFilename(src)}
          className="absolute right-20 top-5 z-20 flex size-12 items-center justify-center rounded-full bg-background-primary text-text-primary shadow-lg transition-colors hover:bg-background-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
          aria-label={intl.formatMessage(i18n.download)}
          onClick={(event) => event.stopPropagation()}
        >
          <Download className="size-6" />
        </a>

        <div
          className="absolute inset-x-4 bottom-24 top-20 overflow-auto rounded-2xl bg-background-primary p-6 sm:inset-x-16"
          data-testid="image-preview-canvas"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className="mx-auto transition-[width] duration-150"
            style={{ width: `${previewScale * 100}%` }}
          >
            <img
              src={src}
              alt={intl.formatMessage(i18n.previewTitle)}
              className="block h-auto w-full max-w-none object-contain"
            />
          </div>
        </div>

        <div
          className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-background-primary p-1.5 text-text-primary shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-background-secondary disabled:opacity-40"
            aria-label={intl.formatMessage(i18n.zoomOut)}
            disabled={previewScale <= MIN_SCALE}
            onClick={() =>
              setPreviewScale((scale) => Math.max(MIN_SCALE, scale - SCALE_STEP))
            }
          >
            <Minus className="size-5" />
          </button>
          <button
            type="button"
            className="min-w-16 rounded-full px-2 py-2 text-sm tabular-nums transition-colors hover:bg-background-secondary"
            aria-label={intl.formatMessage(i18n.resetZoom)}
            onClick={() => setPreviewScale(1)}
          >
            {Math.round(previewScale * 100)}%
          </button>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-background-secondary disabled:opacity-40"
            aria-label={intl.formatMessage(i18n.zoomIn)}
            disabled={previewScale >= MAX_SCALE}
            onClick={() =>
              setPreviewScale((scale) => Math.min(MAX_SCALE, scale + SCALE_STEP))
            }
          >
            <Plus className="size-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { memo, useEffect, useId, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useDocumentTheme } from '../hooks/useDocumentTheme';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

interface MermaidDiagramProps {
  definition: string;
  fallback: React.ReactNode;
}

const MermaidDiagram = memo(function MermaidDiagram({ definition, fallback }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderSequenceRef = useRef(0);
  const diagramId = `mermaid-${useId().replace(/\W/g, '')}`;
  const theme = useDocumentTheme();
  const [renderFailed, setRenderFailed] = useState(false);
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const renderContainer = container;

    let cancelled = false;
    const renderId = `${diagramId}-${++renderSequenceRef.current}`;
    renderContainer.replaceChildren();
    setRenderFailed(false);
    setRenderedSvg(null);
    setPreviewOpen(false);

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          theme: theme === 'dark' ? 'dark' : 'default',
        });

        const { svg, bindFunctions } = await mermaid.render(renderId, definition, renderContainer);
        if (cancelled) return;

        renderContainer.innerHTML = svg;
        bindFunctions?.(renderContainer);
        setRenderedSvg(svg);
      } catch (error) {
        if (cancelled) return;
        console.warn('Failed to render Mermaid diagram:', error);
        setRenderFailed(true);
        setRenderedSvg(null);
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
      renderContainer.replaceChildren();
    };
  }, [definition, diagramId, theme]);

  const updatePreviewOpen = (open: boolean) => {
    const renderContainer = containerRef.current;
    if (open) {
      renderContainer?.replaceChildren();
    } else if (renderContainer && renderedSvg) {
      renderContainer.innerHTML = renderedSvg;
    }
    setPreviewOpen(open);
    if (open) setPreviewScale(1);
  };

  return (
    <>
      <div
        className={`${renderFailed ? 'hidden' : ''} group relative my-3 w-full overflow-hidden rounded-lg border border-border-primary bg-background-secondary`}
        data-testid="mermaid-diagram"
      >
        <div
          ref={containerRef}
          className="w-full overflow-x-auto p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          role="img"
          aria-label="Mermaid diagram"
        />
        <button
          type="button"
          className="absolute inset-0 cursor-zoom-in rounded-lg opacity-0 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-border-active focus-visible:ring-inset"
          data-testid="mermaid-open-preview"
          aria-label="Mermaid"
          disabled={!renderedSvg}
          onClick={() => updatePreviewOpen(true)}
        >
          <span className="absolute right-3 top-3 rounded-lg border border-border-primary bg-background-primary/90 p-2 text-text-secondary shadow-sm backdrop-blur-sm">
            <Maximize2 className="size-4" />
          </span>
        </button>
      </div>
      {renderFailed ? fallback : null}
      <Dialog open={previewOpen} onOpenChange={updatePreviewOpen}>
        <DialogContent className="h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none overflow-hidden p-0 sm:max-w-none">
          <DialogTitle className="sr-only">Mermaid</DialogTitle>
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border-primary bg-background-primary/90 p-1 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-background-secondary hover:text-text-primary disabled:opacity-40"
              aria-label="-"
              disabled={previewScale <= 0.5}
              onClick={() => setPreviewScale((scale) => Math.max(0.5, scale - 0.25))}
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              className="min-w-14 rounded-lg px-2 py-1.5 text-sm tabular-nums text-text-secondary transition-colors hover:bg-background-secondary hover:text-text-primary"
              onClick={() => setPreviewScale(1)}
            >
              {Math.round(previewScale * 100)}%
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-background-secondary hover:text-text-primary disabled:opacity-40"
              aria-label="+"
              disabled={previewScale >= 3}
              onClick={() => setPreviewScale((scale) => Math.min(3, scale + 0.25))}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <div
            className="h-full w-full overflow-auto bg-background-primary px-8 pb-8 pt-16"
            data-testid="mermaid-preview"
          >
            {renderedSvg ? (
              <div
                className="mx-auto [&_svg]:h-auto [&_svg]:w-full [&_svg]:!max-w-none"
                style={{ width: `${previewScale * 100}%` }}
                dangerouslySetInnerHTML={{ __html: renderedSvg }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default MermaidDiagram;

import { memo, useEffect, useId, useRef, useState } from 'react';
import { useDocumentTheme } from '../hooks/useDocumentTheme';

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const renderContainer = container;

    let cancelled = false;
    const renderId = `${diagramId}-${++renderSequenceRef.current}`;
    renderContainer.replaceChildren();
    setRenderFailed(false);

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
      } catch (error) {
        if (cancelled) return;
        console.warn('Failed to render Mermaid diagram:', error);
        setRenderFailed(true);
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
      renderContainer.replaceChildren();
    };
  }, [definition, diagramId, theme]);

  return (
    <>
      <div
        ref={containerRef}
        className={`${renderFailed ? 'hidden' : ''} my-3 w-full overflow-x-auto rounded-lg border border-border-primary bg-background-secondary p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full`}
        data-testid="mermaid-diagram"
        role="img"
        aria-label="Mermaid diagram"
      />
      {renderFailed ? fallback : null}
    </>
  );
});

export default MermaidDiagram;

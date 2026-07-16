import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { cn } from '../utils';

interface ToolCallGroupProps {
  activeLabel: string;
  children: ReactNode;
  completedLabel: string;
  isActive: boolean;
}

export default function ToolCallGroup({
  activeLabel,
  children,
  completedLabel,
  isActive,
}: ToolCallGroupProps) {
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);
  const wasActive = useRef(isActive);

  useEffect(() => {
    if (wasActive.current && !isActive) {
      setManualToggle(false);
    }
    wasActive.current = isActive;
  }, [isActive]);

  const isExpanded = manualToggle ?? isActive;

  return (
    <Collapsible open={isExpanded} onOpenChange={setManualToggle} className="w-[90%] min-w-0">
      <div className="flex items-center gap-3">
        <CollapsibleTrigger className="group flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary">
          <span>{isActive ? activeLabel : completedLabel}</span>
          <ChevronRight className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-90')} />
        </CollapsibleTrigger>
        <div className="h-px min-w-0 flex-1 bg-border-primary" />
      </div>
      <CollapsibleContent className="pt-3">
        <div className="flex flex-col gap-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

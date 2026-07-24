import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../utils';

interface UseResizableWidthOptions {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  /**
   * Which panel the handle belongs to. 'left' means the handle sits on the
   * panel's right edge (drag right to grow); 'right' means it sits on the
   * panel's left edge (drag left to grow).
   */
  side: 'left' | 'right';
}

export function useResizableWidth({
  storageKey,
  defaultWidth,
  min,
  max,
  side,
}: UseResizableWidthOptions) {
  const clamp = useCallback((value: number) => Math.min(max, Math.max(min, value)), [min, max]);

  const [width, setWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored >= min && stored <= max ? stored : defaultWidth;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      dragState.current = { startX: event.clientX, startWidth: width };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!dragState.current) return;
      const delta = event.clientX - dragState.current.startX;
      const signed = side === 'left' ? delta : -delta;
      setWidth(clamp(dragState.current.startWidth + signed));
    },
    [clamp, side]
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!dragState.current) return;
    dragState.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  return {
    width,
    isDragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}

type ResizeHandleProps = {
  isDragging: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function ResizeHandle({ isDragging, className, ...props }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn(
        'group z-20 w-2 cursor-col-resize select-none touch-none',
        'no-drag',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'mx-auto h-full w-px transition-colors',
          isDragging ? 'bg-border-info' : 'bg-transparent group-hover:bg-border-info'
        )}
      />
    </div>
  );
}

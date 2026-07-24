import { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import animationData from './codex-looking-around.json';

export function CodexCloud({ className = '' }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const animation = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData,
    });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotionPreference = () => {
      if (reducedMotion.matches) {
        animation.goToAndStop(0, true);
      } else {
        animation.play();
      }
    };
    applyMotionPreference();
    reducedMotion.addEventListener('change', applyMotionPreference);

    return () => {
      reducedMotion.removeEventListener('change', applyMotionPreference);
      animation.destroy();
    };
  }, []);

  return <div ref={containerRef} className={`codex-cloud ${className}`} aria-hidden="true" />;
}

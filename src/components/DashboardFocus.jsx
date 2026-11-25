import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { Maximize2, Minimize2 } from 'lucide-react';
import { PANEL_IDS, nextFocusedPanel } from '../lib/panel-focus.js';

// GSAP Flip animates genuine CSS Grid rearrangements: no cloned or fake data panels.
gsap.registerPlugin(Flip);

const reducedMotion = () => typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useDashboardFocus() {
  const [focusedPanel, setFocusedPanel] = useState(null);
  const gridRef = useRef(null);
  const beforeRef = useRef(null);
  const tweenRef = useRef(null);

  const toggleFocus = useCallback((target) => {
    if (!PANEL_IDS.includes(target)) return;
    const grid = gridRef.current;
    // Finish any previous Flip before measuring. Killing mid-flight left stale transforms.
    const previous = tweenRef.current;
    if (previous) {
      // Completing a tween runs its onComplete callback, which may clear the ref.
      tweenRef.current = null;
      previous.progress(1);
      previous.kill();
    }
    beforeRef.current = grid && !reducedMotion()
      ? Flip.getState(grid.querySelectorAll('[data-dashboard-panel]'))
      : null;
    setFocusedPanel((current) => nextFocusedPanel(current, target));
  }, []);

  // useLayoutEffect runs after React places the panel in its new grid position,
  // but before paint. Flip animates from the previous measured layout.
  useLayoutEffect(() => {
    const before = beforeRef.current;
    beforeRef.current = null;
    if (!before || !gridRef.current) return;

    const grid = gridRef.current;
    tweenRef.current = Flip.from(before, {
      // Keep panels in the CSS grid's document flow; absolute positioning
      // caused large jumps when the panel dimensions changed.
      absolute: false,
      targets: grid.querySelectorAll('[data-dashboard-panel]'),
      scale: false,
      duration: 0.46,
      ease: 'power2.inOut',
      stagger: 0,
      prune: true,
      onComplete: () => {
        // Never scroll the document automatically when expanding/collapsing.
        // The previous automatic scroll was responsible for page jumps.
        tweenRef.current = null;
      },
    });
    const details = grid.querySelector('.bento-panel.is-expanded .panel-focus-content');
    if (details) {
      gsap.fromTo(details, { autoAlpha: 0, y: 12 }, {
        autoAlpha: 1, y: 0, duration: 0.35, delay: 0.12,
        ease: 'power2.out', clearProps: 'opacity,visibility,transform',
      });
    }
    return () => {
      tweenRef.current?.kill();
      if (details) gsap.killTweensOf(details);
    };
  }, [focusedPanel]);

  useEffect(() => {
    if (!focusedPanel) return;
    const handleEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented ||
          document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      toggleFocus(focusedPanel);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [focusedPanel, toggleFocus]);

  useEffect(() => () => tweenRef.current?.kill(), []);

  return { focusedPanel, gridRef, toggleFocus };
}

export function FocusButton({ panel, label, expanded, onClick }) {
  return (
    <button
      type="button"
      className={`panel-focus-button ${expanded ? 'is-active' : ''}`}
      onClick={() => onClick(panel)}
      aria-expanded={expanded}
      aria-controls={`overview-${panel}`}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
      title={expanded ? 'Return to dashboard grid (Esc)' : `Expand ${label}`}
    >
      {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      <span>{expanded ? 'Back to grid' : 'Expand'}</span>
    </button>
  );
}

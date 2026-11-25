import React, { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export function StudentScene({children}) {
  const root = useRef(null);
  useGSAP(() => {
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = root.current.querySelectorAll('[data-student-enter]');
    gsap.fromTo(items,
      {opacity: 0, y: 16},
      {opacity: 1, y: 0, duration: 0.55, stagger: 0.075, ease: 'power2.out', clearProps: 'opacity,transform'}
    );
  }, {scope: root});
  return <div className="student-v59-scene" ref={root}>{children}</div>;
}

export function StudentMetric({Icon, label, value, detail, tone = 'sage'}) {
  return <div className={`student-v59-metric tone-${tone}`}>
    <span className="student-v59-metric-icon"><Icon size={20} aria-hidden="true"/></span>
    <div><span className="student-v59-metric-label">{label}</span><strong className="student-v59-metric-value">{value}</strong><small>{detail}</small></div>
  </div>;
}

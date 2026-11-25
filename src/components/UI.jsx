import React,{useEffect,useRef,useState} from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { X, AlertCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';

gsap.registerPlugin(useGSAP);
const reduce=()=>typeof window!=='undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Card({children,className='',...props}){return <section className={`glass-card ${className}`} {...props}>{children}</section>;}
export function Title({eyebrow,children,description,actions}){return <div className="page-heading"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{children}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className="heading-actions">{actions}</div>}</div>;}
export function Empty({children='Nothing to show yet.'}){return <div className="empty-state"><AlertCircle size={22}/><span>{children}</span></div>;}
export function Badge({children,tone='muted'}){return <span className={`status-tag ${tone}`}>{children}</span>;}
export function PageAlert({message,onClose}){return message?<div className="alert" role="alert"><AlertCircle size={17}/><span>{message}</span>{onClose&&<button className="icon-btn" aria-label="Dismiss message" onClick={onClose}><X size={17}/></button>}</div>:null;}
export function MotionPage({children,className=''}) {
  const ref = useRef(null);
  useGSAP(() => {
    if (reduce() || !ref.current) return;
    const sections = Array.from(ref.current.children).filter((child) =>
      child.matches('.page-heading, .stats-grid, .overview-grid, .bottom-grid, .dashboard-bento, .glass-card, .student-grid, .student-attendance-grid')
    );
    // Keep the app shell mounted: only animate this route's content.
    gsap.fromTo(ref.current, {autoAlpha: 0.8}, {
      autoAlpha: 1, duration: 0.28, ease: 'power1.out', clearProps: 'opacity,visibility'
    });
    gsap.fromTo(sections, {autoAlpha: 0, y: 20}, {
      autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.09, ease: 'power3.out',
      clearProps: 'opacity,visibility,transform'
    });
  }, {scope: ref});
  return <div ref={ref} className={`page-content ${className}`}>{children}</div>;
}
export function RevealList({children,className=''}) {
  const ref = useRef(null);
  useGSAP((context, contextSafe) => {
    const root = ref.current;
    if (!root || reduce()) return;
    const items = root.querySelectorAll('[data-reveal]');
    gsap.fromTo(items, {y: 20, autoAlpha: 0, scale: 0.98}, {
      y: 0, autoAlpha: 1, scale: 1, stagger: 0.07, duration: 0.65,
      ease: 'power3.out', clearProps: 'transform,opacity,visibility'
    });
    // GSAP hover only for devices that actually support hover.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const cleanups = Array.from(items, (item) => {
      const icon = item.querySelector('.stat-symbol');
      const enter = contextSafe(() => {
        gsap.to(item, {y: -5, scale: 1.012, duration: 0.28, ease: 'power2.out', overwrite: 'auto'});
        if (icon) gsap.to(icon, {scale: 1.08, rotation: -4, duration: 0.3, overwrite: 'auto'});
      });
      const leave = contextSafe(() => {
        gsap.to(item, {y: 0, scale: 1, duration: 0.32, ease: 'power2.out', overwrite: 'auto'});
        if (icon) gsap.to(icon, {scale: 1, rotation: 0, duration: 0.3, overwrite: 'auto'});
      });
      item.addEventListener('pointerenter', enter);
      item.addEventListener('pointerleave', leave);
      return () => {
        item.removeEventListener('pointerenter', enter);
        item.removeEventListener('pointerleave', leave);
      };
    });
    return () => cleanups.forEach((fn) => fn());
  }, {scope: ref});
  return <div ref={ref} className={className}>{children}</div>;
}
export function AnimatedNumber({value=0,decimals=0,suffix=''}) {
  const ref = useRef(null);
  const previous = useRef(0);
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  useGSAP(() => {
    const format = (n) => n.toLocaleString('en-US', {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }) + suffix;
    if (reduce()) {
      if (ref.current) ref.current.textContent = format(number);
      previous.current = number;
      return;
    }
    const counter = {count: previous.current};
    const tween = gsap.to(counter, {
      count: number, duration: 1.15, ease: 'power2.out',
      onUpdate() {if(ref.current) ref.current.textContent = format(counter.count);},
      onComplete() {previous.current = number;}
    });
    return () => {
      previous.current = counter.count;
      tween.kill();
    };
  }, {dependencies: [number, decimals, suffix], scope: ref, revertOnUpdate: true});
  return <span ref={ref}>{number.toLocaleString('en-US', {minimumFractionDigits: decimals,maximumFractionDigits: decimals})}{suffix}</span>;
}
export function StatCard({icon:Icon,title,value,note,tone='mint'}){return <Card className={`stat-card tone-${tone}`} data-reveal><span className="stat-symbol"><Icon size={24}/></span><div className="stat-label">{title}</div><strong className="stat-number">{typeof value==='number'?<AnimatedNumber value={value}/>:value}</strong><p>{note}</p></Card>;}
export function PanelTitle({icon:Icon,title,subtitle,action}){return <div className="panel-heading"><span className="panel-glyph"><Icon size={19}/></span><div className="panel-heading-text"><h2>{title}</h2><p>{subtitle}</p></div>{action&&<div className="panel-action">{action}</div>}</div>;}
export function Modal({title,subtitle,onClose,children,drawer=false}) {
  const root = useRef(null);
  const panel = useRef(null);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const {contextSafe} = useGSAP(() => {
    if (reduce()) return;
    const timeline = gsap.timeline();
    timeline.fromTo(root.current, {autoAlpha: 0}, {
      autoAlpha: 1, duration: 0.22, ease: 'power1.out'
    });
    timeline.fromTo(panel.current, {
      autoAlpha: 0, x: drawer ? 65 : 0, y: drawer ? 0 : 24, scale: drawer ? 1 : 0.97
    }, {
      autoAlpha: 1, x: 0, y: 0, scale: 1,
      duration: 0.46, ease: 'power3.out', clearProps: 'opacity,visibility,transform'
    }, 0.06);
  }, {scope: root});

  // A closing transition instead of instantly removing the drawer from the DOM.
  // contextSafe makes the event-handler animations lifecycle-aware.
  const requestClose = contextSafe(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduce()) {onCloseRef.current(); return;}
    gsap.to(panel.current, {
      x: drawer ? 70 : 0, y: drawer ? 0 : 15, scale: drawer ? 1 : 0.98,
      autoAlpha: 0, duration: 0.25, ease: 'power2.in', overwrite: 'auto'
    });
    gsap.to(root.current, {
      autoAlpha: 0, duration: 0.3, ease: 'power2.in', overwrite: 'auto',
      onComplete: () => onCloseRef.current()
    });
  });
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  useEffect(() => {
    const prior = document.activeElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('button, input, select')?.focus();
    const key = (event) => {
      if (event.key === 'Escape') {event.preventDefault();closeRef.current();}
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
      if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener('keydown', key);
      prior?.focus?.();
    };
  }, []);
  return createPortal(
    <div ref={root} className="modal-backdrop" onMouseDown={(e) => {if (e.target === e.currentTarget) requestClose();}}>
      <div ref={panel} className={`modal-panel ${drawer ? 'drawer-panel' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>
          <button className="icon-btn" onClick={requestClose} aria-label="Close"><X size={21}/></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>, document.body
  );
}
export function DataTable({columns,rows,empty='No records found',className=''}){return <div className={`table-scroll ${className}`}><table><thead><tr>{columns.map((c,i)=><th key={i}>{c}</th>)}</tr></thead><tbody>{rows.length?rows:<tr><td colSpan={columns.length}><Empty>{empty}</Empty></td></tr>}</tbody></table></div>;}
export function ActionLink({onClick,children}){return <button className="text-action" onClick={onClick}>{children}<ArrowUpRight size={15}/></button>;}
export function SuccessIcon(){return <CheckCircle2 size={18} className="success-text"/>;}

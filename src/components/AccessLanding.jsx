import React, { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ArrowUpRight, BookOpen, Github, LockKeyhole } from 'lucide-react';
import { PageAlert } from './UI.jsx';
import { loginWithGitHub } from '../lib/auth.js';

gsap.registerPlugin(useGSAP);

/**
 * Full-viewport StudentMonitor access screen.
 * Visual change only: the Supabase GitHub OAuth and authorization flow is unchanged.
 */
export function AccessLanding() {
  const rootRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Lock only the login page. Restore scrolling for student/admin pages.
  useEffect(() => {
    document.documentElement.classList.add('sm-access-locked');
    document.body.classList.add('sm-access-locked');
    return () => {
      document.documentElement.classList.remove('sm-access-locked');
      document.body.classList.remove('sm-access-locked');
    };
  }, []);

  useGSAP(() => {
    if (!rootRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
    timeline.fromTo('[data-access-reveal]',
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.65, stagger: 0.075, clearProps: 'all' }
    );
    timeline.fromTo('.access-pattern-line',
      { scaleX: 0, transformOrigin: 'left center' },
      { scaleX: 1, duration: 0.55, stagger: 0.065, clearProps: 'transform' },
      0.2
    );
  }, { scope: rootRef });

  async function signIn() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await loginWithGitHub();
    } catch (err) {
      setError(err?.message || 'Unable to open GitHub sign-in. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main className="access-page" ref={rootRef}>
      <div className="access-frame">
        <section className="access-editorial" aria-labelledby="access-title">
          <div className="access-editorial-top" data-access-reveal>
            <div className="access-brand" aria-label="StudentMonitor">
              <img src={`${import.meta.env.BASE_URL}studentmonitor-icon.png`} alt="" width="40" height="40" />
              <span>StudentMonitor<span className="access-brand-dot">.</span></span>
            </div>
            <span className="access-editorial-index">01 — ACCESS</span>
          </div>

          <div className="access-editorial-core">
            <div className="access-pattern" aria-hidden="true" data-access-reveal>
              <span className="access-pattern-index">SM / 01</span>
              <span className="access-pattern-line access-pattern-line-one" />
              <span className="access-pattern-line access-pattern-line-two" />
              <span className="access-pattern-line access-pattern-line-three" />
              <span className="access-pattern-tick" />
            </div>
            <div data-access-reveal>
              <p className="access-editorial-kicker">YOUR CLASS, ORGANIZED</p>
              <h1 id="access-title">Class starts<br />here<span>.</span></h1>
              <p className="access-editorial-copy">Your schedule, student profile, and attendance—all in one place.</p>
            </div>
          </div>

          <div className="access-editorial-bottom" data-access-reveal>
            <span className="access-editorial-rule" />
            <span>STUDENTMONITOR / CLASSROOM</span>
          </div>
        </section>

        <section className="access-signin" aria-labelledby="access-signin-title">
          <div className="access-signin-top" data-access-reveal>
            <span className="access-overline">STUDENT ACCESS</span>
            <span className="access-signin-number">01<span>/</span>01</span>
          </div>

          <div className="access-signin-content">
            <div className="access-book-icon" data-access-reveal aria-hidden="true">
              <BookOpen size={23} strokeWidth={1.8} />
            </div>
            <h2 id="access-signin-title" data-access-reveal>Welcome to<br />StudentMonitor.</h2>
            <p className="access-signin-copy" data-access-reveal>Sign in with the GitHub account you created for class.</p>
            <div data-access-reveal>
              <PageAlert message={error} onClose={() => setError('')} />
              <button type="button" className="access-github-button" onClick={signIn} disabled={busy} aria-busy={busy}>
                <Github size={20} strokeWidth={2} aria-hidden="true" />
                <span>{busy ? 'Opening GitHub…' : 'Continue with GitHub'}</span>
                <ArrowUpRight size={19} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <p className="access-privacy" data-access-reveal>
              <LockKeyhole size={15} aria-hidden="true" />
              <span>Sign-in is handled securely by GitHub.</span>
            </p>
          </div>

          <div className="access-signin-bottom" data-access-reveal>
            <div><span className="access-bottom-dot" /> First time signing in?</div>
            <p>Complete your student profile and wait for instructor approval.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

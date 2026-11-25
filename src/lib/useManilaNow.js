import { useEffect, useState } from 'react';
import { manilaClock } from './schedule.js';

// Update the displayed class state when time passes or a background tab returns.
// The database still determines actual attendance permission.
export function useManilaNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    const interval = window.setInterval(update, 15_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return { now, clock: manilaClock(now) };
}

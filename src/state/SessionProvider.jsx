import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { configured, supabase } from '../lib/supabase.js';
import { getAdminData, getCatalog, getContext, getMyAttendance, getMyClassData, rpc } from '../lib/api.js';
import { startHeartbeat } from '../lib/auth.js';

// A portal session that has expired at the database level cannot be revived by
// refreshing the page. Require a fresh GitHub OAuth sign-in instead.
function isExpiredSession(error) {
  return /portal session.*expired|session expired; sign in again|authentication session.*invalid|jwt expired|session.*revoked/i.test(error?.message || '');
}

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

export function SessionProvider({children}) {
  const [context,setContext] = useState(null);
  const [data,setData] = useState(null);
  const [catalog,setCatalog] = useState(null);
  const [initializing,setInitializing] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState('');
  const [lastSyncedAt,setLastSyncedAt] = useState(null);
  const version = useRef(0);
  const current = useRef(null);
  const busy = useRef(false);

  const loadFor = useCallback(async (ctx) => {
    if (!ctx) return null;
    if (ctx.admin) return getAdminData();
    if (!ctx.profile || !ctx.profile.is_approved) return getCatalog();
    const [attendance,classes,cat] = await Promise.all([
      getMyAttendance(ctx.user.id),getMyClassData(ctx.profile.section_id),getCatalog()
    ]);
    return {attendance,...classes,...cat};
  },[]);

  // Only initial load and an actual authentication transition block access.
  // Navigating among React routes NEVER remounts this provider.
  const reload = useCallback(async ({silent=false}={}) => {
    const id=++version.current;
    if (silent) setRefreshing(true); else if(!current.current) setInitializing(true);
    try {
      const ctx = await getContext();
      if(id!==version.current)return;
      if (current.current?.user?.id !== ctx?.user?.id) {
        setData(null); setCatalog(null);
      }
      current.current=ctx;
      setContext(ctx);
      const result=await loadFor(ctx);
      if(id!==version.current)return;
      setData(ctx?.profile?.is_approved || ctx?.admin ? result : null);
      setCatalog(ctx && !ctx.admin && !ctx.profile?.is_approved ? result : null);
      setError('');
      setLastSyncedAt(new Date().toISOString());
    } catch(e) {
      if(id!==version.current)return;
      if (isExpiredSession(e)) {
        // An expired session must never continue using cached admin data.
        current.current=null;
        setContext(null);
        setData(null);
        setCatalog(null);
        setError('');
        try {
          // Clear this browser session, then React routes to /login.
          const {error:signOutError} = await supabase.auth.signOut({scope:'local'});
          if (signOutError) throw signOutError;
        } catch(signOutError) {
          setError('Your session expired. Please clear site data for this local website and sign in again.');
        }
      } else {
        setError(e.message||'Unable to connect to Supabase');
      }
      // Other network/database failures remain visible and do not grant access.
    } finally {
      if(id===version.current){setInitializing(false);setRefreshing(false);}
    }
  },[loadFor]);

  const refreshData = useCallback(async () => {
    if (busy.current || !current.current) return;
    busy.current=true;
    setRefreshing(true);
    const revision=version.current;
    try {
      // Server-side revalidation runs in the background, never on tab change.
      // Also notices revoked approvals, expired portal sessions and role changes.
      const ctx=await getContext({touchSession:false});
      if(revision!==version.current)return;
      if(!ctx){ current.current=null;setContext(null);setData(null);setCatalog(null);return; }
      const changed=ctx.user.id!==current.current?.user?.id || ctx.admin!==current.current?.admin || ctx.profile?.is_approved!==current.current?.profile?.is_approved || ctx.profile?.section_id!==current.current?.profile?.section_id;
      current.current=ctx;
      if(changed){ setData(null);setCatalog(null); }
      setContext(ctx);
      const fresh=await loadFor(ctx);
      if(revision!==version.current)return;
      if(ctx.admin || ctx.profile?.is_approved){setData(fresh);setCatalog(null);}
      else{setCatalog(fresh);setData(null);}
      setError('');
      setLastSyncedAt(new Date().toISOString());
    } catch(e) {
      const message=e.message||'Unable to refresh data';
      if (isExpiredSession(e)) {
        current.current=null;setContext(null);setData(null);setCatalog(null);setError('');
        try {
          const {error:signOutError}=await supabase.auth.signOut({scope:'local'});
          if(signOutError)throw signOutError;
        } catch {
          setError('Your session expired. Please clear site data for this local website and sign in again.');
        }
      } else setError(message);
    }
    finally { busy.current=false; setRefreshing(false); }
  },[loadFor]);

  useEffect(()=>{
    if(!configured){setInitializing(false);return;}
    startHeartbeat();
    reload();
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT') {
        version.current++;
        current.current=null;
        setContext(null);setData(null);setCatalog(null);setError('');setInitializing(false);
      } else if(event==='SIGNED_IN' && session?.user?.id !== current.current?.user?.id) {
        // Defer Supabase API calls until outside its authentication callback.
        setTimeout(()=>reload({silent:!!current.current}),0);
      }
    });
    return ()=>{subscription.unsubscribe();version.current++;};
  },[reload]);

  useEffect(()=>{
    if(!context)return;
    const t=setInterval(()=>{
      if(document.visibilityState==='visible')refreshData();
    },60000);
    return ()=>clearInterval(t);
  },[context?.user?.id,context?.admin,refreshData]);

  async function perform(action){
    setRefreshing(true);setError('');
    try {const result=await action();await refreshData();return result;}
    catch(e){setError(e.message||'Action failed');throw e;}
    finally{setRefreshing(false);}
  }

  return <SessionContext.Provider value={{configured,context,data,catalog,initializing,refreshing,error,setError,reload,refreshData,perform,lastSyncedAt}}>{children}</SessionContext.Provider>;
}

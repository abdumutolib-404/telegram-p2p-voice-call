import { useEffect, useRef, useState } from 'react';
import { dashboardRequest } from '../services/dashboard';

export function StarterGift({initData,onClaimed}:{initData:string;onClaimed?:()=>void}) {
  const [claimed,setClaimed]=useState<boolean|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  const guard=useRef(false);
  useEffect(()=>{
    if(!initData)return;
    const controller=new AbortController();
    void dashboardRequest<{claimed:boolean}>(initData,'/starter-gift',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setClaimed(result.claimed);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Starter practice could not be checked.');});
    return()=>controller.abort();
  },[initData,attempt]);
  if(!initData||claimed===true)return null;
  async function check(){
    if(guard.current)return;guard.current=true;setBusy(true);setError('');setNotice('');
    try{const result=await dashboardRequest<{claimed:boolean;alreadyClaimed?:boolean;member?:boolean}>(initData,'/starter-gift',{method:'POST',body:'{}'});
      if(result.claimed||result.alreadyClaimed){setClaimed(true);onClaimed?.();}
      else setNotice('Join @pairtalk, then check membership again to claim your starter calls.');
    }catch(e){setError(e instanceof Error?e.message:'Membership could not be verified.');}
    finally{guard.current=false;setBusy(false);}
  }
  return <section className="starter-gift" aria-label="Free starter calls"><h2>Start with three free calls</h2><p>Join @pairtalk and claim three 15-minute calls once. You can use two units for one 30-minute call.</p><div className="starter-gift__actions"><a className="secondary-button" href="https://t.me/pairtalk" target="_blank" rel="noreferrer" onClick={event=>{if(window.Telegram?.WebApp?.openTelegramLink){event.preventDefault();window.Telegram.WebApp.openTelegramLink('https://t.me/pairtalk');}}}>Join channel ↗</a><button type="button" className="primary-button" disabled={busy||claimed===null} onClick={()=>void check()}>{busy?'Checking membership…':'Check membership & claim'}</button></div>{claimed===null&&!error&&<p role="status">Checking starter eligibility…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}<button type="button" className="text-button" onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>}<details><summary>How the starter gift works</summary><p>The server checks channel membership before adding three call units. This gift is available once per account; leaving and rejoining does not grant it again. Previously granted starter calls and paid balances are preserved.</p></details></section>;
}

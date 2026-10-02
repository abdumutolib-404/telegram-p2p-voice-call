import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { AdminStats, UserItem, ManualPaymentRequestItem, AppealItem, SystemHealthTelemetry, MatchmakingQueueTelemetry, ActiveCallsTelemetry } from '../../types';
import { adminFetch } from '../../api/client';
import { useVisiblePolling } from '../../hooks/useAdminTools';
import { PageHeader } from '../ui/PageHeader';
import { StatCard } from '../ui/StatCard';
export function OverviewDashboard({ onNavigateTab }: { onNavigateTab:(tab:'users'|'plans'|'payments'|'appeals'|'analytics'|'contest'|'audit')=>void }) {
  const [stats,setStats]=useState<AdminStats|null>(null), [users,setUsers]=useState<UserItem[]|null>(null);
  const [payments,setPayments]=useState<ManualPaymentRequestItem[]|null>(null), [appeals,setAppeals]=useState<AppealItem[]|null>(null);
  const [health,setHealth]=useState<SystemHealthTelemetry|null>(null), [queue,setQueue]=useState<MatchmakingQueueTelemetry|null>(null), [calls,setCalls]=useState<ActiveCallsTelemetry|null>(null);
  const [errors,setErrors]=useState<string[]>([]), [loading,setLoading]=useState(false), [updated,setUpdated]=useState<string|null>(null);
  const busy=useRef(false), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const refresh=useCallback(async()=>{
    if(busy.current)return;busy.current=true;setLoading(true);
    const sources=[['Statistics','/api/admin/stats',setStats],['Candidates','/api/admin/users',setUsers],['Payments','/api/admin/payments/manual?tab=queue',setPayments],['Appeals','/api/admin/appeals',setAppeals],['Service health','/api/admin/telemetry/health',setHealth],['Waiting queue','/api/admin/telemetry/queue',setQueue],['Active calls','/api/admin/telemetry/active-calls',setCalls]] as const;
    const results=await Promise.allSettled(sources.map(async ([,endpoint,setter])=>{const data=await adminFetch<never>(endpoint);if(mounted.current)setter(data);}));
    if(mounted.current){setErrors(results.flatMap((result,index)=>result.status==='rejected'?[sources[index][0]+': '+(result.reason instanceof Error?result.reason.message:'Unavailable')]:[]));if(results.some(r=>r.status==='fulfilled'))setUpdated(new Date().toISOString());setLoading(false);}busy.current=false;
  },[]);
  useEffect(()=>{void refresh();},[refresh]);useVisiblePolling(refresh,15000);
  const sample=useMemo(()=>{const buckets=new Map<string,number>();for(const user of users||[]){const d=new Date(user.createdAt);if(!Number.isNaN(d.getTime())){const key=d.toISOString().slice(0,10);buckets.set(key,(buckets.get(key)||0)+1);}}return [...buckets].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);},[users]);
  const value=(n:number|undefined)=>n===undefined?'Unavailable':n.toLocaleString();
  return <div style={{display:'grid',gap:24}}><PageHeader title="Overview" description="Service health and operational queues." actions={<button className="btn-secondary" onClick={()=>void refresh()} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button>}/>
    {errors.length>0&&<div role="alert" className="inline-error"><strong>Some data could not be refreshed. Last successful results remain displayed.</strong>{errors.map(e=><p key={e}>{e}</p>)}<button className="btn-secondary" onClick={()=>void refresh()} disabled={loading}>Retry</button></div>}
    <p role="status">{updated?'Last refresh: '+new Date(updated).toLocaleString():'Waiting for server data.'}</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,190px),1fr))',gap:16}}>
      <StatCard label="Candidates" value={value(stats?.totalUsers)} onClick={()=>onNavigateTab('users')}/><StatCard label="Daily active" value={value(stats?.dau)}/>
      <StatCard label="Active calls" value={value(calls?.activeCallsCount)}/><StatCard label="Waiting for a partner" value={value(queue?.waitingCount)}/>
      <StatCard label="Pending payments" value={payments?payments.filter(p=>p.status==='PENDING').length:'Unavailable'} onClick={()=>onNavigateTab('payments')}/><StatCard label="Pending appeals" value={appeals?appeals.filter(p=>!p.status||p.status.toUpperCase()==='PENDING').length:'Unavailable'} onClick={()=>onNavigateTab('appeals')}/>
    </div>
    <section className="glass-panel" style={{padding:20}}><h2>Service health</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))',gap:16}}>{(['database','redis','livekit','bot'] as const).map(name=><div key={name}><h3>{name==='livekit'?'Voice service':name==='bot'?'Telegram bot':name==='redis'?'Redis':'Database'}</h3><p>{health?.[name]?.status??'Unavailable'}</p><p>{health?.[name]?.latencyMs!==undefined?health[name].latencyMs+' ms':'Latency unavailable'}</p></div>)}</div></section>
    <section className="glass-panel" style={{padding:20}}><h2>Registration sample</h2><p>Latest {users?.length??'unavailable'} candidates returned by the server; this is a sample, not total platform growth. Dates are UTC.</p>{users&&sample.length===0?<p>No registrations in this sample.</p>:<div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Registrations in sample</th></tr></thead><tbody>{sample.map(([date,count])=><tr key={date}><td>{date}</td><td>{count}</td></tr>)}</tbody></table></div>}</section>
    <section className="glass-panel" style={{padding:20}}><h2>Current calls</h2>{calls?calls.rooms.length?<div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Participants</th><th>Duration</th><th>Recording</th></tr></thead><tbody>{calls.rooms.map(room=><tr key={room.roomName}><td>{room.userA} / {room.userB}</td><td>{room.durationSec}s</td><td>{room.recording?'Yes':'No'}</td></tr>)}</tbody></table></div>:<p>No calls in the latest snapshot.</p>:<p>Unavailable</p>}</section>
  </div>;
}

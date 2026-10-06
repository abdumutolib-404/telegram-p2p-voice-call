import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { completeCallSession } from '../services/callCompletion';
import { registerReadyParticipant } from '../services/mediaAuthorization';
import { publishRoomRecordingSnapshot } from '../services/recordingStatus';
import { setupSocketSignaling, scheduleConnectionHandshakeTimer, sweepZombieSessions } from '../socket/signaling';
import { setupRefundHandlers } from '../bot/handlers/refund';

const provider=vi.hoisted(()=>({enable:vi.fn(async()=>{}),start:vi.fn(),stop:vi.fn(),presence:0,status:1,info:vi.fn()}));
vi.mock('../config/livekit',()=>({
 generateLiveKitToken:async()=> 'synthetic-token',enableCallSubscriptions:provider.enable,
 startAudioEgress:provider.start,stopAudioEgress:provider.stop,deleteLiveKitRoom:async()=>{},
 countCallParticipants:async()=>provider.presence,areCallParticipantsPresent:async()=>provider.presence>0,
 getAudioEgressInfo:provider.info,
}));
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
beforeEach(()=>{vi.useFakeTimers();provider.enable.mockClear().mockResolvedValue();provider.presence=0;provider.status=1;provider.info.mockImplementation(async()=>provider.status<0?null:{status:provider.status});});

async function fixture(){
 const n=crypto.randomInt(1000000,9999999),a=await prisma.user.create({data:{telegramId:BigInt(n*2),alias:'a-'+n}}),b=await prisma.user.create({data:{telegramId:BigInt(n*2+1),alias:'b-'+n}});
 const session=await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:a.id,userBId:b.id}});
 return {a,b,session};
}
function sockets(){
 let connection:Function=()=>{};const broadcast=vi.fn();
 const io={use:()=>{},on:(_name:string,fn:Function)=>{connection=fn;},to:()=>({emit:broadcast}),in:()=>({fetchSockets:async()=>[]}),sockets:{sockets:new Map()}};
 setupSocketSignaling(io as any);
 return {io,broadcast,connect:(userId:string)=>{const events:Record<string,Function>={},emit=vi.fn();connection({id:crypto.randomUUID(),data:{userId},use:()=>{},on:(name:string,fn:Function)=>{events[name]=fn;},emit,join:()=>{},leave:()=>{}});return {events,emit};}};
}

describe('durable media authorization and accounting',()=>{
 it('requires both distinct owners, persists across independent readiness, and rejects outsiders',async()=>{
  const {a,b,session}=await fixture();
  expect(await registerReadyParticipant(session.id,'outsider')).toBe(false);
  expect(await registerReadyParticipant(session.id,a.id)).toBe(false);expect(await registerReadyParticipant(session.id,a.id)).toBe(false);
  expect(await registerReadyParticipant(session.id,b.id)).toBe(true);
  expect((await prisma.callSession.findUnique({where:{id:session.id}}))?.mediaAuthorizedAt).toBeInstanceOf(Date);
  expect(await registerReadyParticipant(session.id,a.id)).toBe(true);
 });
 it('cannot turn previously authorized media into an uncharged cancellation, including duplicate completion',async()=>{
  const {a,b,session}=await fixture();await registerReadyParticipant(session.id,a.id);await registerReadyParticipant(session.id,b.id);
  await vi.advanceTimersByTimeAsync(60000);
  expect(await completeCallSession(session.id,{status:'CANCELLED',endedAt:new Date(),duration:0})).toEqual({count:1});
  const completed=await prisma.callSession.findUnique({where:{id:session.id}});expect(completed?.status).toBe('COMPLETED');expect(completed?.duration).toBe(60);
  expect((await prisma.user.findUnique({where:{id:a.id}}))?.dailyCallsUsed).toBe(1);
  expect(await completeCallSession(session.id,{status:'CANCELLED',endedAt:new Date(),duration:0})).toEqual({count:0});
 });
 it('preserves free failed joins when the subscription gate never opened',async()=>{
  const {a,session}=await fixture();await vi.advanceTimersByTimeAsync(90000);
  await completeCallSession(session.id,{status:'CANCELLED',endedAt:new Date(),duration:0});
  expect((await prisma.callSession.findUnique({where:{id:session.id}}))?.duration).toBe(0);expect((await prisma.user.findUnique({where:{id:a.id}}))?.dailyCallsUsed).toBe(0);
 });
 it('persists before provider updates, and safely retries partial permission failure',async()=>{
  const {a,b,session}=await fixture(),h=sockets(),first=h.connect(a.id),second=h.connect(b.id);
  provider.enable.mockImplementationOnce(async()=>{expect((await prisma.callSession.findUnique({where:{id:session.id}}))?.mediaAuthorizedAt).toBeTruthy();throw new Error('Synthetic permission failure');});
  await first.events.peer_ready({roomName:session.roomName});expect(provider.enable).not.toHaveBeenCalled();
  await second.events.peer_ready({roomName:session.roomName});expect(provider.enable).toHaveBeenCalledTimes(1);
  await second.events.peer_ready({roomName:session.roomName});expect(provider.enable).toHaveBeenCalledTimes(2);expect(h.broadcast).toHaveBeenCalledWith('call_started',expect.anything());
 });
 it('charges an authorized departed session at handshake and preserves a never-authorized failure',async()=>{
  const {a,b,session}=await fixture(),h=sockets();await registerReadyParticipant(session.id,a.id);await registerReadyParticipant(session.id,b.id);
  scheduleConnectionHandshakeTimer(session.roomName,90,undefined,h.io as any);await vi.advanceTimersByTimeAsync(92000);
  expect((await prisma.callSession.findUnique({where:{id:session.id}}))?.status).toBe('COMPLETED');
  const failed=await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:a.id,userBId:b.id}});
  scheduleConnectionHandshakeTimer(failed.roomName,90,undefined,h.io as any);await vi.advanceTimersByTimeAsync(91000);
  expect((await prisma.callSession.findUnique({where:{id:failed.id}}))?.status).toBe('CANCELLED');
 });
 it('cannot refund prior authorization through zombie cleanup',async()=>{
  const {a,b,session}=await fixture(),h=sockets();await registerReadyParticipant(session.id,a.id);await registerReadyParticipant(session.id,b.id);
  await vi.advanceTimersByTimeAsync(95000);await sweepZombieSessions(h.io as any);
  expect((await prisma.callSession.findUnique({where:{id:session.id}}))?.status).toBe('COMPLETED');
 });
 it('counts media available throughout reconnect grace instead of refunding early signaling loss',async()=>{
  const {a,b,session}=await fixture(),h=sockets(),first=h.connect(a.id);
  await registerReadyParticipant(session.id,a.id);await registerReadyParticipant(session.id,b.id);
  await vi.advanceTimersByTimeAsync(1000);first.events.disconnect('transport close');
  await vi.advanceTimersByTimeAsync(16000);
  const completed=await prisma.callSession.findUnique({where:{id:session.id}});
  expect(completed?.status).toBe('COMPLETED');expect(completed?.duration).toBeGreaterThanOrEqual(16);
  expect((await prisma.user.findUnique({where:{id:a.id}}))?.dailyCallsUsed).toBe(1);
 });
});

describe('room capture differs from personal saved-copy intent',()=>{
 it('does not broadcast an old stop result over a sibling gateway recording restart',async()=>{
  const {session}=await fixture(),h=sockets();
  await prisma.callSession.update({where:{id:session.id},data:{egressId:'old-stopped-egress'}});
  let release:(value:unknown)=>void=()=>{};
  provider.info.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const observation=Date.now(),pending=publishRoomRecordingSnapshot(session.roomName,'old-stopped-egress');
  await vi.waitFor(()=>expect(provider.info).toHaveBeenCalled());await vi.advanceTimersByTimeAsync(10);
  await prisma.callSession.update({where:{id:session.id},data:{egressId:'new-active-egress'}});
  release({status:3});await pending;
  expect(h.broadcast).toHaveBeenCalledWith('room_recording_status',expect.objectContaining({state:'unknown',updatedAt:observation}));
 });
 it('does not publish a delayed old-egress off result as newer than a restarted capture',async()=>{
  const {a,session}=await fixture(),h=sockets(),first=h.connect(a.id);
  await prisma.callSession.update({where:{id:session.id},data:{egressId:'old-stopped-egress'}});
  let release:(value:unknown)=>void=()=>{};
  provider.info.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const observation=Date.now(),pending=first.events.get_recording_status({roomName:session.roomName});
  await vi.waitFor(()=>expect(provider.info).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(10);
  await prisma.callSession.update({where:{id:session.id},data:{egressId:'new-active-egress',activeRecorderIds:a.id}});
  release({status:3});await pending;
  expect(first.emit).toHaveBeenCalledWith('room_recording_status',{roomName:session.roomName,state:'unknown',updatedAt:observation});
  expect(first.emit).toHaveBeenCalledWith('record_status',{roomName:session.roomName,record:true});
 });
 it('rejects pre-ready egress and broadcasts capture while keeping independent personal choices',async()=>{
  const {a,b,session}=await fixture(),h=sockets(),first=h.connect(a.id),second=h.connect(b.id);
  provider.start.mockClear().mockImplementation(async (_room:string,prepare:Function)=>{await prepare('recordings/'+crypto.randomUUID()+'.mp3');return {egressId:'synthetic-egress',relativeUrl:'recordings/result.mp3'};});
  await first.events.toggle_record({roomName:session.roomName,record:true});expect(provider.start).not.toHaveBeenCalled();
  await registerReadyParticipant(session.id,a.id);await registerReadyParticipant(session.id,b.id);
  await first.events.toggle_record({roomName:session.roomName,record:true});expect(h.broadcast).toHaveBeenCalledWith('room_recording_status',expect.objectContaining({roomName:session.roomName,state:'on'}));
  await second.events.get_recording_status({roomName:session.roomName});expect(second.emit).toHaveBeenCalledWith('record_status',{roomName:session.roomName,record:false});expect(second.emit).toHaveBeenCalledWith('room_recording_status',expect.objectContaining({state:'on'}));
  await second.events.toggle_record({roomName:session.roomName,record:false});expect(h.broadcast.mock.calls.at(-1)?.[1].state).toBe('on');
  provider.status=-1;await first.events.toggle_record({roomName:session.roomName,record:false});expect(h.broadcast.mock.calls.at(-1)?.[1].state).toBe('unknown');
 });
});

describe('refund initiation ownership',()=>{
 it('never discloses a known foreign request or changes session state, while an owner can proceed',async()=>{
  const {a,b}=await fixture(),payment=await prisma.manualPaymentRequest.create({data:{userId:a.id,telegramId:a.telegramId,alias:a.alias,plan:'PLUS',uzsAmount:90000,status:'APPROVED'}});
  let initiate:Function=()=>{};setupRefundHandlers({command:()=>{},on:()=>{},callbackQuery:(pattern:RegExp|string,fn:Function)=>{if(pattern instanceof RegExp && pattern.source.startsWith('^submit_uzs_refund:')) initiate=fn;}} as any);
  const context=(id:number|undefined)=>({from:id?{id}:undefined,match:['',payment.id],answerCallbackQuery:async()=>{},reply:vi.fn(async()=>{}),session:{}});
  const foreign=context(Number(b.telegramId));await initiate(foreign);expect(foreign.session).toEqual({});expect(foreign.reply.mock.calls[0][0]).not.toContain('90000');expect(foreign.reply.mock.calls[0][0]).toContain('not found');
  const owner=context(Number(a.telegramId));await initiate(owner);expect(owner.session).toMatchObject({step:'awaiting_refund_card',pendingRefundManualReqId:payment.id});expect(owner.reply.mock.calls[0][0]).toContain(payment.orderNumber!);
  const absent=context(undefined);await initiate(absent);expect(absent.reply).not.toHaveBeenCalled();
  await prisma.manualPaymentRequest.update({where:{id:payment.id},data:{status:'REFUNDED'}});const stale=context(Number(a.telegramId));await initiate(stale);expect(stale.session).toEqual({});
 });
});

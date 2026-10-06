import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ActiveCallScreen } from '../src/components/ActiveCallScreen';
import { PrivacyScreen } from '../src/components/PrivacyScreen';

const fixture=vi.hoisted(()=>({events:new Map<string,Function>(),snapshot:vi.fn(),ready:vi.fn(),toggle:vi.fn()}));
vi.mock('../src/services/socket',()=>({socketService:{getSocket:()=>({on:(name:string,fn:Function)=>fixture.events.set(name,fn),off:(name:string)=>fixture.events.delete(name)}),getRecordingStatus:fixture.snapshot,peerReady:fixture.ready,toggleRecord:fixture.toggle}}));
vi.mock('../src/components/AudioVisualizer',()=>({AudioVisualizer:()=>null}));
vi.mock('../src/components/QuestionsDrawer',()=>({QuestionsDrawer:()=>null}));
let root:Root,container:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();fixture.events.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();});
async function screen(){await act(async()=>root.render(createElement(ActiveCallScreen,{roomName:'current-room',userId:'a',partnerAlias:'Partner',partnerBand:7,callDurationLimit:900,isMicMuted:false,onToggleMic:()=>{},onFinishCall:()=>{}})));}
async function emit(name:string,payload?:unknown){await act(async()=>fixture.events.get(name)?.(payload));}

it('shows room capture without activating the other user saved-copy toggle',async()=>{
 await screen();expect(container.textContent).toContain('RECORDING STATUS UNCONFIRMED');expect(fixture.snapshot).toHaveBeenCalledWith('current-room');
 await emit('room_recording_status',{roomName:'current-room',state:'on',updatedAt:2});expect(container.textContent).toContain('ROOM RECORDING ON');expect(container.querySelector('[aria-label="Start recording"]')).toBeTruthy();
 await emit('record_status',{roomName:'current-room',record:false});expect(container.textContent).toContain('ROOM RECORDING ON');
 await emit('recording_error',{message:'Own allowance exhausted'});expect(container.textContent).toContain('ROOM RECORDING ON');
 await emit('record_status',{roomName:'current-room',record:true});expect(container.querySelector('[aria-label="Stop recording"]')).toBeTruthy();
});
it('ignores older and other-room updates and treats disconnects as uncertain',async()=>{
 await screen();await emit('room_recording_status',{roomName:'current-room',state:'on',updatedAt:3});
 await emit('room_recording_status',{roomName:'old-room',state:'off',updatedAt:4});await emit('room_recording_status',{roomName:'current-room',state:'off',updatedAt:1});expect(container.textContent).toContain('ROOM RECORDING ON');
 await emit('room_recording_status',{roomName:'current-room',state:'off',updatedAt:3});expect(container.textContent).toContain('ROOM RECORDING ON');
 await emit('disconnect');expect(container.textContent).toContain('RECORDING STATUS UNCONFIRMED');
 await emit('connect');expect(fixture.snapshot).toHaveBeenCalledTimes(2);expect(fixture.ready).toHaveBeenCalledWith('current-room');
 await act(async()=>vi.advanceTimersByTime(15000));expect(fixture.snapshot).toHaveBeenCalledTimes(3);
});
it('describes transport encryption and media-service access accurately',async()=>{
 await act(async()=>root.render(createElement(PrivacyScreen,{})));expect(container.textContent).toContain('not end-to-end encryption that hides audio from the media service');expect(container.textContent).toContain('processes account identifiers');expect(container.textContent).not.toContain('strict zero-knowledge');expect(container.textContent).not.toContain('expire automatically upon call termination');
});

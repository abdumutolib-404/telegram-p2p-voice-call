import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { generateLiveKitToken, generateRecordingFileName, enableCallSubscriptions, roomServiceClient } from '../config/livekit';

afterEach(()=>vi.restoreAllMocks());
describe('provider media gate and recording identity',()=>{
 it('mints room-scoped tokens that allow microphone setup but deny reception and data before readiness',async()=>{
  const token=await generateLiveKitToken('room','user','Practice alias',300),payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  expect(payload.sub).toBe('user');expect(payload.video).toMatchObject({room:'room',roomJoin:true,canPublish:true,canSubscribe:false,canPublishData:false});
 });
 it('attempts both permission updates even if one participant is temporarily absent',async()=>{
  const update=vi.spyOn(roomServiceClient!,'updateParticipant').mockRejectedValueOnce(new Error('Missing participant')).mockResolvedValueOnce({} as any);
  await expect(enableCallSubscriptions('room',['a','b'])).rejects.toThrow('Missing participant');expect(update).toHaveBeenCalledTimes(2);expect(update.mock.calls[1]).toEqual(['room','b',{permission:{canPublish:true,canSubscribe:true,canPublishData:true}}]);
 });
 it('keeps calls in different namespaces even when UUID/time sources are deliberately repeated',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));vi.spyOn(crypto,'randomUUID').mockReturnValue('01234567-89ab-4cde-8f01-23456789abcd');
  const a=generateRecordingFileName('a'),b=generateRecordingFileName('b');expect(a).not.toBe(b);expect(a).toMatch(/_[a-f0-9]{32}_[a-f0-9-]{36}\.mp3$/);expect(generateRecordingFileName('../../escape')).not.toMatch(/[\/\\]/);vi.useRealTimers();
 });
 it('uses a fresh full UUID for every recording restart',()=>{expect(generateRecordingFileName('same-room')).not.toBe(generateRecordingFileName('same-room'));});
});

import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import { checkOfferChannel } from '../services/packCampaigns';
import { OFFER_CHANNEL_ID } from '../services/packOfferInventory';

function fixture(member:Record<string,unknown>={status:'administrator',can_post_messages:true}) {
  const api={getMe:vi.fn().mockResolvedValue({id:999000,username:'FixturePracticeBot'}),getChatMember:vi.fn().mockResolvedValue(member),sendMessage:vi.fn()};
  return {api,bot:{api} as unknown as Pick<Bot,'api'>};
}

describe('read-only channel capability check',()=>{
  it.each(['administrator','creator'])('accepts a capable %s without publishing',async status=>{
    const {api,bot}=fixture(status==='creator'?{status}:{status,can_post_messages:true});
    await expect(checkOfferChannel(bot)).resolves.toMatchObject({channelId:OFFER_CHANNEL_ID,ready:true,botUsername:'FixturePracticeBot'});
    expect(api.getChatMember).toHaveBeenCalledWith(OFFER_CHANNEL_ID,999000);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
  it.each(['member','left','kicked','restricted'])('identifies a non-admin %s and the actual configured bot',async status=>{
    const {bot}=fixture({status});
    await expect(checkOfferChannel(bot)).rejects.toThrow('Add @FixturePracticeBot as an administrator in @pairtalk');
  });
  it('distinguishes missing Post Messages from missing administrator status',async()=>{
    const {bot}=fixture({status:'administrator',can_post_messages:false});
    await expect(checkOfferChannel(bot)).rejects.toThrow('is an administrator in @pairtalk but Post Messages is disabled');
  });
  it.each([400,403])('explains channel access rejection %i without exposing provider payloads',async error_code=>{
    const {api,bot}=fixture();
    api.getChatMember.mockRejectedValue({error_code,description:'private-provider-payload'});
    const error=await checkOfferChannel(bot).catch((value:Error)=>value);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Telegram cannot access the configured @pairtalk channel');
    expect((error as Error).message).toContain(OFFER_CHANNEL_ID);
    expect((error as Error).message).not.toContain('private-provider-payload');
  });
  it.each(['identity','membership'])('distinguishes invalid credentials at %s without exposing the token',async stage=>{
    const {api,bot}=fixture();
    (stage==='identity'?api.getMe:api.getChatMember).mockRejectedValue({error_code:401,description:'private-provider-payload'});
    await expect(checkOfferChannel(bot)).rejects.toThrow('Telegram rejected the configured bot credentials');
    if(stage==='identity')expect(api.getChatMember).not.toHaveBeenCalled();
  });
  it.each(['identity','membership'])('does not misdiagnose a temporary %s failure as missing permissions',async stage=>{
    const {api,bot}=fixture();
    (stage==='identity'?api.getMe:api.getChatMember).mockRejectedValue(new Error('private-provider-payload'));
    const error=await checkOfferChannel(bot).catch((value:Error)=>value);
    expect((error as Error).message).toContain('temporarily unavailable');
    expect((error as Error).message).toContain('does not establish a missing permission');
    expect((error as Error).message).not.toContain('private-provider-payload');
  });
  it('keeps rate limiting distinct from a permanent permission rejection',async()=>{
    const {api,bot}=fixture();api.getChatMember.mockRejectedValue({error_code:429});
    await expect(checkOfferChannel(bot)).rejects.toThrow('Telegram is rate limiting requests');
  });
});

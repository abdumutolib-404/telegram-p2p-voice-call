import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCallFinishedEvent, CallFinishedEventMessage } from '../services/eventSubscriber';
import { sendPostCallReviewCard } from '../bot/handlers/postCall';
import { onCallFinishedCheckReferralReward } from '../services/referralService';
import type { Bot } from 'grammy';
import type { MyContext } from '../bot/types';

vi.mock('../bot/handlers/postCall', () => ({
  sendPostCallReviewCard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/referralService', () => ({
  onCallFinishedCheckReferralReward: vi.fn().mockResolvedValue(undefined),
}));

describe('eventSubscriber service', () => {
  let mockBot: Partial<Bot<MyContext>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBot = {
      api: {
        sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
      } as any,
    };
  });

  it('triggers referral check and sends post-call review cards on normal call completion', async () => {
    const msg: CallFinishedEventMessage = {
      type: 'CALL_FINISHED',
      sessionId: 'sess-123',
      roomName: 'room-123',
      userAId: 'user-a',
      userBId: 'user-b',
      userATelegramId: '111111',
      userBTelegramId: '222222',
      userAAlias: 'Candidate A',
      userBAlias: 'Candidate B',
      durationSeconds: 120,
      recordingUrl: 'https://s3.example.com/audio.mp3',
      retentionDaysA: 7,
      retentionDaysB: null,
      reason: 'normal_completion',
    };

    await handleCallFinishedEvent(msg, mockBot as Bot<MyContext>);

    expect(onCallFinishedCheckReferralReward).toHaveBeenCalledWith(
      {
        id: 'sess-123',
        userAId: 'user-a',
        userBId: 'user-b',
        duration: 120,
      },
      mockBot
    );

    expect(sendPostCallReviewCard).toHaveBeenCalledTimes(2);
    // User A call review card
    expect(sendPostCallReviewCard).toHaveBeenCalledWith(
      mockBot,
      '111111',
      'sess-123',
      'Candidate B',
      120,
      'https://s3.example.com/audio.mp3',
      7
    );
    // User B call review card (did not record, so undefined for recordingUrl & retentionDays)
    expect(sendPostCallReviewCard).toHaveBeenCalledWith(
      mockBot,
      '222222',
      'sess-123',
      'Candidate A',
      120,
      undefined,
      undefined
    );
  });

  it('does not send post-call review cards if duration < 5 seconds', async () => {
    const msg: CallFinishedEventMessage = {
      type: 'CALL_FINISHED',
      sessionId: 'sess-short',
      roomName: 'room-short',
      userAId: 'user-a',
      userBId: 'user-b',
      userATelegramId: '111111',
      userBTelegramId: '222222',
      userAAlias: 'Candidate A',
      userBAlias: 'Candidate B',
      durationSeconds: 3,
      reason: 'cancelled',
    };

    await handleCallFinishedEvent(msg, mockBot as Bot<MyContext>);

    expect(onCallFinishedCheckReferralReward).toHaveBeenCalled();
    expect(sendPostCallReviewCard).not.toHaveBeenCalled();
  });

  it('sends microphone permission denied alert to both parties when reason is microphone_permission_denied', async () => {
    const msg: CallFinishedEventMessage = {
      type: 'CALL_FINISHED',
      sessionId: 'sess-mic',
      roomName: 'room-mic',
      userAId: 'user-a',
      userBId: 'user-b',
      userATelegramId: '111111',
      userBTelegramId: '222222',
      userAAlias: 'Candidate A',
      userBAlias: 'Candidate B',
      durationSeconds: 2,
      reason: 'microphone_permission_denied',
    };

    await handleCallFinishedEvent(msg, mockBot as Bot<MyContext>);

    expect(onCallFinishedCheckReferralReward).toHaveBeenCalled();
    expect(sendPostCallReviewCard).not.toHaveBeenCalled();
    expect(mockBot.api?.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockBot.api?.sendMessage).toHaveBeenCalledWith(
      '111111',
      expect.stringContaining('Microphone Access Denied'),
      expect.any(Object)
    );
    expect(mockBot.api?.sendMessage).toHaveBeenCalledWith(
      '222222',
      expect.stringContaining('Call Disconnected'),
      expect.any(Object)
    );
  });

  it('correctly attributes microphone permission denial to user B when requesterId is user B', async () => {
    const msg: CallFinishedEventMessage = {
      type: 'CALL_FINISHED',
      sessionId: 'sess-mic-b',
      roomName: 'room-mic-b',
      userAId: 'user-a',
      userBId: 'user-b',
      userATelegramId: '111111',
      userBTelegramId: '222222',
      userAAlias: 'Candidate A',
      userBAlias: 'Candidate B',
      durationSeconds: 1,
      reason: 'microphone_permission_denied',
      requesterId: 'user-b',
    };

    await handleCallFinishedEvent(msg, mockBot as Bot<MyContext>);

    expect(mockBot.api?.sendMessage).toHaveBeenCalledTimes(2);
    // User B receives the denial warning
    expect(mockBot.api?.sendMessage).toHaveBeenCalledWith(
      '222222',
      expect.stringContaining('Microphone Access Denied'),
      expect.any(Object)
    );
    // User A receives the disconnected notice
    expect(mockBot.api?.sendMessage).toHaveBeenCalledWith(
      '111111',
      expect.stringContaining('Call Disconnected'),
      expect.any(Object)
    );
  });
});

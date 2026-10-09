import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import { prisma } from '../config/database';
import { currentTerms, hasAcceptedCurrentTerms, termsPdfPath } from '../services/terms';
import { offerTerms, setupTermsHandlers } from '../bot/handlers/terms';
import { setupCallbackHandlers } from '../bot/handlers/callbacks';
import { setupStartCommand } from '../bot/commands/start';
import type { MyContext } from '../bot/types';

function fixture() {
  const context = { from: { id: Math.floor(Math.random() * 1000000000) + 1000000000 }, chat: { type: 'private' }, session: { step: 'idle' }, reply: vi.fn().mockResolvedValue({ message_id: 10 }), replyWithDocument: vi.fn().mockResolvedValue({ message_id: 50 }), answerCallbackQuery: vi.fn().mockResolvedValue(true), editMessageReplyMarkup: vi.fn().mockResolvedValue(true), callbackQuery: { message: { message_id: 50 } }, match: ['terms_accept', 'accept', currentTerms.version] } as unknown as MyContext;
  const handlers = new Map<string, (ctx: MyContext) => Promise<void>>();
  const fakeBot = { api: { sendMessage: vi.fn().mockResolvedValue(true) }, command: (name: string, callback: (ctx: MyContext) => Promise<void>) => { handlers.set(`command:${name}`, callback); }, callbackQuery: (pattern: RegExp | string, callback: (ctx: MyContext) => Promise<void>) => { handlers.set(String(pattern), callback); } } as unknown as Bot<MyContext>;
  setupTermsHandlers(fakeBot); setupCallbackHandlers(fakeBot); setupStartCommand(fakeBot);
  const consent = handlers.get(String(/^terms_(accept|decline):(.+)$/))!;
  return { context, consent, handlers };
}
describe('Versioned registration agreement', () => {
  it('sends an accepted PDF for reference without changing registration progress or offering consent again', async () => {
    const { context } = fixture();
    await prisma.user.create({ data: { telegramId: BigInt(context.from!.id), alias: 'P2P-PDF-COPY', termsAcceptedVersion: currentTerms.version, termsDocumentSha256: currentTerms.sha256, termsAcceptedAt: new Date() } });
    context.session = { step: 'lr', fc: 6.5 };
    await offerTerms(context);
    expect(context.session).toEqual({ step: 'lr', fc: 6.5 });
    expect(context.reply).not.toHaveBeenCalled();
    const options = vi.mocked(context.replyWithDocument).mock.calls[0][1]!;
    expect(JSON.stringify(options.reply_markup)).not.toContain('terms_accept');
    expect(JSON.stringify(options.reply_markup)).not.toContain('terms_decline');
  });
  it('ships the exact reviewed PDF in both server and gateway releases', () => {
    expect(fs.readFileSync(termsPdfPath).subarray(0, 5).toString()).toBe('%PDF-');
    expect(crypto.createHash('sha256').update(fs.readFileSync(termsPdfPath)).digest('hex')).toBe(currentTerms.sha256);
    const gateway = fs.readFileSync(path.resolve(__dirname, '../../../gateway/internal/auth/terms.go'), 'utf8');
    expect(gateway).toContain(`TermsVersion = "${currentTerms.version}"`);
    expect(gateway).toContain(`TermsDocumentSHA256 = "${currentTerms.sha256}"`);
  });
  it('delivers the PDF before offering registration and persists version, time and hash', async () => {
    const { context, consent } = fixture();
    await offerTerms(context);
    expect(context.session.step).toBe('terms');
    expect(context.session.termsOffer?.messageId).toBe(50);
    expect(context.replyWithDocument).toHaveBeenCalledOnce();
    expect(context.session.fc).toBeUndefined();
    await consent(context);
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(context.from!.id) } });
    expect(hasAcceptedCurrentTerms(user)).toBe(true);
    expect(user?.onboarded).toBe(false);
    const audit = await prisma.termsAcceptance.findMany({ where: { userId: user!.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ version: currentTerms.version, documentSha256: currentTerms.sha256, source: 'TELEGRAM_BOT' });
    expect(context.session.step).toBe('fc');
    // Replayed consent cannot create another acceptance or jump the score flow.
    await consent(context);
    expect(await prisma.termsAcceptance.findMany({ where: { userId: user!.id } })).toHaveLength(1);
    expect(context.session.step).toBe('fc');
  });
  it('declines without creating an account or consent and invalidates the accept button', async () => {
    const { context, consent } = fixture(); await offerTerms(context);
    context.match = ['terms_decline', 'decline', currentTerms.version]; await consent(context);
    expect(context.session.step).toBe('idle');
    context.match = ['terms_accept', 'accept', currentTerms.version]; await consent(context);
    expect(await prisma.user.findUnique({ where: { telegramId: BigInt(context.from!.id) } })).toBeNull();
  });
  it.each(['version', 'message', 'document'])('rejects a stale or forged %s offer', async kind => {
    const { context, consent } = fixture(); await offerTerms(context);
    if (kind === 'version') context.match = ['terms_accept', 'accept', '2020-01-01'];
    if (kind === 'message') context.callbackQuery!.message!.message_id = 99;
    if (kind === 'document') context.session.termsOffer!.sha256 = '0'.repeat(64);
    await consent(context);
    expect(await prisma.user.findUnique({ where: { telegramId: BigInt(context.from!.id) } })).toBeNull();
    expect(context.session.step).toBe('terms');
  });
  it('does not accept terms when sending the PDF fails', async () => {
    const { context, consent } = fixture(); vi.mocked(context.replyWithDocument).mockRejectedValueOnce(new Error('Upload failed'));
    await expect(offerTerms(context)).rejects.toThrow('Upload failed');
    expect(context.session.termsOffer).toBeUndefined();
    await consent(context);
    expect(await prisma.user.findUnique({ where: { telegramId: BigInt(context.from!.id) } })).toBeNull();
  });
  it('cannot finalize a score form without persisted acceptance', async () => {
    const { context, handlers } = fixture();
    context.session = { step: 'confirm', fc: 6, lr: 6, gra: 6, p: 6 };
    await handlers.get('confirm_subscores')!(context);
    expect(context.replyWithDocument).toHaveBeenCalledOnce();
    expect(context.session.step).toBe('terms');
    expect(await prisma.user.findUnique({ where: { telegramId: BigInt(context.from!.id) } })).toBeNull();
  });
  it('reads durable consent after the in-progress form is lost', async () => {
    const { context, consent, handlers } = fixture(); await offerTerms(context); await consent(context);
    context.session = { step: 'confirm', fc: 6, lr: 6, gra: 6, p: 6 };
    await handlers.get('confirm_subscores')!(context);
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(context.from!.id) } });
    expect(user?.onboarded).toBe(true); expect(hasAcceptedCurrentTerms(user)).toBe(true);
  });
  it.each(['accept', 'decline'])('defers referral registration until consent: %s', async decision => {
    const inviter = await prisma.user.create({ data: { telegramId: BigInt(Math.floor(Math.random() * 1000000000) + 3000000000), alias: 'P2P-REFERRER' } });
    const { context, consent, handlers } = fixture();
    context.match = `ref_${inviter.telegramId}`;
    await handlers.get('command:start')!(context);
    expect(context.replyWithDocument).toHaveBeenCalledOnce();
    expect(await prisma.user.findUnique({ where: { telegramId: BigInt(context.from!.id) } })).toBeNull();
    context.match = [`terms_${decision}`, decision, currentTerms.version]; await consent(context);
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(context.from!.id) } });
    if (decision === 'decline') expect(user).toBeNull();
    else { expect(hasAcceptedCurrentTerms(user)).toBe(true); expect(user?.referredByUserId).toBe(inviter.id); }
    expect(context.session.pendingReferralPayload).toBeUndefined();
  });
});

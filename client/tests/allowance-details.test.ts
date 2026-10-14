import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AllowanceDetails } from '../src/components/AllowanceDetails';
import type { UserMatchData } from '../src/types';

const profile: UserMatchData = { userId: 'fixture', band: 7, weakSkill: 'P', strongSkill: 'FC', includedCallsRemaining: 2, bonusCallsRemaining: 1 };
it('explains a free reset in UTC and separates permanent bonus calls', () => {
  const html = renderToStaticMarkup(createElement(AllowanceDetails, { userData: { ...profile,
    allowancePeriod: { kind: 'calendar_month', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' } } }));
  expect(html).toContain('00:00 UTC'); expect(html).toContain('reset on');
  expect(html).toContain('included calls'); expect(html).toContain('1 bonus call remaining'); expect(html).toContain('do not expire');
});
it('describes the purchased period ending without promising an automatic paid renewal', () => {
  const html = renderToStaticMarkup(createElement(AllowanceDetails, { userData: { ...profile,
    allowancePeriod: { kind: 'subscription', startsAt: '2026-10-02T09:30:00Z', endsAt: '2027-01-02T09:30:00Z' } } }));
  expect(html).toContain('lasts until'); expect(html).toContain('Renew in Telegram'); expect(html).not.toContain('reset on');
});
it('does not fabricate dates when period data is unavailable', () => {
  expect(renderToStaticMarkup(createElement(AllowanceDetails, { userData: profile }))).toBe('');
});
